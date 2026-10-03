"""A minimal `pytest` look-alike (fixture, raises, mark) so the direct tests run without pytest."""
import sys
import types


def fixture(fn=None, **_kw):
    def mark(f):
        f._is_fixture = True
        return f

    return mark(fn) if callable(fn) else mark


class raises:
    def __init__(self, exc_type, match=None):
        self.exc_type = exc_type
        self.match = match

    def __enter__(self):
        return self

    def __exit__(self, et, ev, tb):
        if et is None:
            raise AssertionError(f"DID NOT RAISE {self.exc_type}")
        if not issubclass(et, self.exc_type):
            return False
        if self.match is not None:
            import re

            if not re.search(self.match, str(ev)):
                raise AssertionError(f"exception {ev!r} does not match {self.match!r}")
        return True


def install():
    mod = types.ModuleType("pytest")
    mod.fixture = fixture
    mod.raises = raises
    sys.modules.setdefault("pytest", mod)
    return mod
