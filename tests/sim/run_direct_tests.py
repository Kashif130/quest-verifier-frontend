"""
Runs tests/direct/test_quest_verifier.py with no dependencies installed (no pytest, no genlayer,
no gltest) against an in-process model of the GenLayer runtime.

    python3 tests/sim/run_direct_tests.py [-v] [-k substring] [--contract path/to/QuestVerifier.py]

This is a convenience for fast local feedback. It is NOT a substitute for running the same tests
under the real GenLayer test tooling (gltest direct mode), and it cannot exercise consensus.
"""
import argparse
import importlib
import importlib.util
import inspect
import pathlib
import sys
import traceback

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import genlayer_sim as sim  # noqa: E402
import pytest_shim  # noqa: E402

try:  # prefer the real pytest if it is installed
    import pytest  # noqa: F401
except ModuleNotFoundError:
    pytest_shim.install()

PEOPLE = {
    "direct_alice": "0x" + "a1" * 20,
    "direct_bob": "0x" + "b2" * 20,
    "direct_carol": "0x" + "c3" * 20,
    "direct_dave": "0x" + "d4" * 20,
    "direct_eve": "0x" + "e5" * 20,
}


class Env:
    """Builds fixtures for one test."""

    def __init__(self, contract_path, conftest):
        self.vm = sim.reset_vm()
        self.contract_path = contract_path
        self.conftest = conftest
        self.cache = {}
        self.vm.sender = sim.Address(PEOPLE["direct_alice"])

    def deploy(self, path, args=None):
        spec = importlib.util.spec_from_file_location("qv_contract_under_test", self.contract_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        cls = next(
            v for v in vars(mod).values()
            if inspect.isclass(v) and issubclass(v, sim.Contract) and v is not sim.Contract
        )
        instance = cls.__new__(cls)
        # constructor runs as a transaction from the current sender; reverts abort deployment
        cls.__init__(instance, *[sim.u256(int(a)) if isinstance(a, int) else a for a in (args or [])])
        deployed = sim.Deployed(instance)
        self.last_module = mod
        return deployed

    def get(self, name):
        if name in self.cache:
            return self.cache[name]
        if name == "direct_vm":
            val = self.vm
        elif name == "direct_deploy":
            val = self.deploy
        elif name in PEOPLE:
            val = sim.Address(PEOPLE[name])
        elif hasattr(self.conftest, name) and getattr(getattr(self.conftest, name), "_is_fixture", False):
            fn = getattr(self.conftest, name)
            val = fn(**{p: self.get(p) for p in inspect.signature(fn).parameters})
        else:
            raise KeyError(f"unknown fixture {name}")
        self.cache[name] = val
        return val


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-v", action="store_true")
    ap.add_argument("-k", default="")
    ap.add_argument("--tests", default=str(ROOT / "tests" / "direct"))
    ap.add_argument("--contract", default=str(ROOT / "contracts" / "QuestVerifier.py"))
    args = ap.parse_args()

    sim.install()
    sys.path.insert(0, args.tests)
    conftest = importlib.import_module("conftest")
    tests_mod = importlib.import_module("test_quest_verifier")

    names = [n for n in dir(tests_mod) if n.startswith("test_") and args.k in n]
    passed, failed = 0, []
    for name in names:
        fn = getattr(tests_mod, name)
        env = Env(args.contract, conftest)
        try:
            fn(**{p: env.get(p) for p in inspect.signature(fn).parameters})
            passed += 1
            if args.v:
                print(f"PASS {name}")
        except BaseException:
            failed.append(name)
            print(f"FAIL {name}")
            traceback.print_exc(limit=6)
    print(f"\n{passed} passed, {len(failed)} failed, {len(names)} total")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
