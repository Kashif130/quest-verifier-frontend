"""
Static checks for the mistakes that made v0.2 fail GenLayer's contract-schema introspection
("Could not load contract schema") even though the file ran fine under plain Python.

    python3 -m unittest discover -s tests/sim -v

These are source-level rules, so they run with nothing installed. They cannot prove the contract
loads on a real GenLayer node; they catch the specific mistakes already known to break it.
"""
import ast
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = (ROOT / "contracts" / "QuestVerifier.py").read_text()
TREE = ast.parse(SOURCE)

ALLOWED_PARAM_TYPES = {"u256", "Address", "str", "bool", "dict", "list"}
ALLOWED_RETURN_TYPES = ALLOWED_PARAM_TYPES | {"None"}
ALLOWED_STORAGE_TYPES = {"u256", "Address", "str", "bool", "TreeMap", "DynArray"}


def contract_class():
    for node in TREE.body:
        if isinstance(node, ast.ClassDef) and any(
            isinstance(b, ast.Attribute) and b.attr == "Contract" for b in node.bases
        ):
            return node
    raise AssertionError("no gl.Contract subclass found")


def decorator_chain(dec):
    parts = []
    while isinstance(dec, ast.Attribute):
        parts.append(dec.attr)
        dec = dec.value
    if isinstance(dec, ast.Name):
        parts.append(dec.id)
    return list(reversed(parts))


def public_methods():
    cls = contract_class()
    out = []
    for node in cls.body:
        if not isinstance(node, ast.FunctionDef):
            continue
        is_public = any(decorator_chain(d)[:2] == ["gl", "public"] for d in node.decorator_list)
        if is_public or node.name == "__init__":
            out.append(node)
    return out


def ann_name(ann):
    if ann is None:
        return None
    if isinstance(ann, ast.Constant) and ann.value is None:
        return "None"
    if isinstance(ann, ast.Name):
        return ann.id
    if isinstance(ann, ast.Subscript) and isinstance(ann.value, ast.Name):
        return ann.value.id
    return ast.dump(ann)


class SchemaRules(unittest.TestCase):
    def test_there_are_public_methods_to_check(self):
        self.assertGreater(len(public_methods()), 20)

    def test_every_public_parameter_is_annotated_with_an_sdk_type(self):
        problems = []
        for fn in public_methods():
            for arg in fn.args.args:
                if arg.arg == "self":
                    continue
                name = ann_name(arg.annotation)
                if name not in ALLOWED_PARAM_TYPES:
                    problems.append(f"{fn.name}({arg.arg}): {name}")
        self.assertEqual(problems, [], "public parameters must use u256/Address/str/bool/dict/list")

    def test_every_public_return_type_is_an_sdk_type(self):
        problems = []
        for fn in public_methods():
            name = ann_name(fn.returns)
            if name not in ALLOWED_RETURN_TYPES:
                problems.append(f"{fn.name} -> {name}")
        self.assertEqual(problems, [], "public returns must be u256/Address/str/bool/dict/list/None")

    def test_no_plain_int_on_the_public_surface(self):
        for fn in public_methods():
            for arg in fn.args.args:
                self.assertNotEqual(ann_name(arg.annotation), "int", f"{fn.name}({arg.arg})")
            self.assertNotEqual(ann_name(fn.returns), "int", f"{fn.name} return")

    def test_storage_fields_use_storage_types(self):
        cls = contract_class()
        problems = []
        for node in cls.body:
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                name = ann_name(node.annotation)
                if name not in ALLOWED_STORAGE_TYPES:
                    problems.append(f"{node.target.id}: {name}")
        self.assertEqual(problems, [])

    def test_addresses_are_typed_address_not_str(self):
        # parameters that carry a wallet address must be Address so the schema can encode them
        address_like = {"user", "new_owner"}
        for fn in public_methods():
            for arg in fn.args.args:
                if arg.arg in address_like:
                    self.assertEqual(ann_name(arg.annotation), "Address", f"{fn.name}({arg.arg})")

    def test_no_datetime_stdlib(self):
        imports = [
            n for n in ast.walk(TREE)
            if (isinstance(n, ast.Import) and any(a.name.split(".")[0] == "datetime" for a in n.names))
            or (isinstance(n, ast.ImportFrom) and (n.module or "").split(".")[0] == "datetime")
        ]
        self.assertEqual(imports, [], "the datetime module is not available in the GenLayer runtime")

    def test_no_nonexistent_get_contract_at(self):
        self.assertNotIn("get_contract_at", SOURCE)

    def test_outbound_transfers_go_through_a_declared_interface(self):
        self.assertIn("@gl.evm.contract_interface", SOURCE)
        self.assertIn("emit_transfer", SOURCE)

    def test_only_json_is_imported_from_the_stdlib_for_logic(self):
        stdlib = {
            n.names[0].name for n in TREE.body if isinstance(n, ast.Import)
        } | {n.module for n in TREE.body if isinstance(n, ast.ImportFrom) and n.module != "genlayer"}
        self.assertTrue(stdlib <= {"json", "dataclasses"}, stdlib)


class KnownBadPatternsAreCaught(unittest.TestCase):
    """Make sure the checks above would actually have flagged the v0.2 mistakes."""

    def test_plain_int_parameter_is_flagged(self):
        fn = ast.parse("def f(self, quest_id: int) -> None: ...").body[0]
        self.assertNotIn(ann_name(fn.args.args[1].annotation), ALLOWED_PARAM_TYPES)

    def test_str_for_an_address_is_flagged_by_name(self):
        fn = ast.parse("def f(self, user: str) -> None: ...").body[0]
        self.assertEqual(ann_name(fn.args.args[1].annotation), "str")  # allowed type, but wrong for `user`


if __name__ == "__main__":
    unittest.main()
