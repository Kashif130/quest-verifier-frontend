"""
A small in-process stand-in for the GenLayer runtime, just faithful enough to execute the
QuestVerifier contract source and its direct-mode tests with nothing installed.

What it models: contract storage as plain Python (TreeMap / DynArray / dataclasses mutated by
reference), msg.sender / msg.value, the contract clock, gl.eq_principle.strict_eq, mocked
web rendering and LLM calls, UserError reverts (state is rolled back on any exception), native
transfers (applied only if the whole call succeeds) and the contract's native balance.

What it does NOT model: consensus, validators disagreeing, real page rendering, gas, or the
GenLayer schema introspection that rejects non-SDK types on public signatures (the contract
is separately checked for that by tests/sim/test_schema_rules.py).
"""
import copy
import inspect
import re
import sys
import types


class UserError(Exception):
    pass


class u256(int):
    pass


class Address(str):
    def __new__(cls, value):
        if isinstance(value, (bytes, bytearray)):
            value = "0x" + bytes(value).hex()
        v = str(value).lower()
        if not (v.startswith("0x") and len(v) == 42):
            raise ValueError(f"bad address: {value!r}")
        int(v[2:], 16)
        return super().__new__(cls, v)


ZERO_ADDRESS = Address("0x" + "00" * 20)


class TreeMap(dict):
    def __class_getitem__(cls, _item):
        return cls


class DynArray(list):
    def __class_getitem__(cls, _item):
        return cls


def allow_storage(cls):
    return cls


class VMState:
    """One simulated chain + one deployed contract. Fresh per test."""

    def __init__(self):
        self.sender = None
        self.value = 0
        self.raw = {"datetime": "2026-01-01T00:00:00Z"}
        self.web_mocks = []
        self.llm_mocks = []
        self.llm_prompts = []
        self.web_urls = []
        self.balance = 0
        self.pending_transfers = []
        self.sent = []  # (to, amount) of every committed transfer

    # ---- test-facing API (mirrors gltest's direct_vm) -------------------------
    def warp(self, iso):
        self.raw["datetime"] = iso

    def mock_web(self, pattern, response):
        self.web_mocks.append((re.compile(pattern), response))

    def mock_llm(self, pattern, response):
        self.llm_mocks.append((re.compile(pattern, re.DOTALL), response))

    def clear_mocks(self):
        self.web_mocks.clear()
        self.llm_mocks.clear()


VM = VMState()


class _Msg:
    @property
    def sender_address(self):
        return VM.sender

    @property
    def value(self):
        return u256(VM.value)


class _Web:
    def render(self, url, mode="text", **_kw):
        VM.web_urls.append(url)
        for pattern, response in VM.web_mocks:
            if pattern.search(url):
                if response.get("status", 200) >= 400:
                    raise Exception(f"HTTP {response['status']}")
                return response["body"]
        raise Exception("no web mock matched " + url)


class _Nondet:
    web = _Web()

    def exec_prompt(self, prompt, **_kw):
        VM.llm_prompts.append(prompt)
        for pattern, response in VM.llm_mocks:
            if pattern.search(prompt):
                return response
        raise Exception("no llm mock matched")


class _EqPrinciple:
    def strict_eq(self, fn):
        return fn()


class _Deco:
    def __init__(self, kind, payable=False):
        self.kind = kind
        self.payable_default = payable

    def __call__(self, fn):
        fn._gl_kind = self.kind
        fn._gl_payable = self.payable_default
        return fn

    @property
    def payable(self):
        return _Deco(self.kind, payable=True)


class _Public:
    view = _Deco("view")
    write = _Deco("write")


class _Evm:
    @staticmethod
    def contract_interface(_cls):
        class Proxy:
            def __init__(self, address):
                self.address = address

            def emit_transfer(self, *, value=0):
                VM.pending_transfers.append((str(self.address), int(value)))

        return Proxy


class Contract:
    """Base class: zero-initialises storage fields from the class annotations."""

    def __new__(cls, *args, **kwargs):
        obj = object.__new__(cls)
        for klass in reversed(cls.__mro__):
            for name, ann in getattr(klass, "__annotations__", {}).items():
                if ann is TreeMap:
                    setattr(obj, name, TreeMap())
                elif ann is DynArray:
                    setattr(obj, name, DynArray())
                elif ann is Address:
                    setattr(obj, name, ZERO_ADDRESS)
                elif ann is bool:
                    setattr(obj, name, False)
                elif ann is u256:
                    setattr(obj, name, u256(0))
                elif ann is str:
                    setattr(obj, name, "")
        return obj


class _Gl(types.ModuleType):
    pass


gl = _Gl("genlayer.gl")
gl.message = _Msg()
gl.message_raw = VM.raw
gl.nondet = _Nondet()
gl.eq_principle = _EqPrinciple()
gl.public = _Public()
gl.evm = _Evm()
gl.Contract = Contract
gl.vm = types.SimpleNamespace(UserError=UserError)


def install():
    """Registers the fake `genlayer` package. Returns the shared VM state."""
    module = types.ModuleType("genlayer")
    module.gl = gl
    module.allow_storage = allow_storage
    module.u256 = u256
    module.Address = Address
    module.TreeMap = TreeMap
    module.DynArray = DynArray
    module.__all__ = ["gl", "allow_storage", "u256", "Address", "TreeMap", "DynArray"]
    sys.modules["genlayer"] = module
    sys.modules["genlayer.gl"] = gl
    return VM


def reset_vm():
    VM.__init__()
    gl.message_raw = VM.raw
    return VM


# ---------------------------------------------------------------------------
# Deployed-contract proxy: coerces arguments, rolls back state on revert, moves value.
# ---------------------------------------------------------------------------
class Deployed:
    def __init__(self, instance):
        object.__setattr__(self, "_raw", instance)

    def __getattr__(self, name):
        raw = object.__getattribute__(self, "_raw")
        fn = getattr(type(raw), name, None)
        if fn is None or not hasattr(fn, "_gl_kind"):
            raise AttributeError(f"{name} is not a public contract method")
        kind = fn._gl_kind
        payable = fn._gl_payable
        hints = {
            p: a.annotation
            for p, a in inspect.signature(fn).parameters.items()
            if a.annotation is not inspect.Parameter.empty
        }
        names = [p for p in inspect.signature(fn).parameters if p != "self"]

        def call(*args, **kwargs):
            bound = dict(zip(names, args))
            bound.update(kwargs)
            for p, v in list(bound.items()):
                ann = hints.get(p)
                if ann is u256:
                    bound[p] = u256(int(v))
                elif ann is Address:
                    bound[p] = v if isinstance(v, Address) else Address(v)
            if kind == "view":
                return _plain(fn(raw, **bound))
            if VM.value and not payable:
                raise UserError("non-payable method called with value")
            snapshot = copy.deepcopy(raw.__dict__)
            VM.pending_transfers.clear()
            try:
                result = fn(raw, **bound)
            except BaseException:
                raw.__dict__.clear()
                raw.__dict__.update(snapshot)
                VM.pending_transfers.clear()
                raise
            VM.balance += int(VM.value)
            for to, amount in VM.pending_transfers:
                if amount > VM.balance:
                    raise AssertionError("contract tried to send more than its balance")
                VM.balance -= amount
                VM.sent.append((to, amount))
            VM.pending_transfers.clear()
            return _plain(result)

        return call


def _plain(v):
    if isinstance(v, dict):
        return {str(k): _plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_plain(x) for x in v]
    if isinstance(v, Address):
        return str(v)
    if isinstance(v, u256):
        return int(v)
    return v
