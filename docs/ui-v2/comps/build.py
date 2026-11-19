"""Inline src/core.js into each src/comp-*.html and write comp-*.html next to this file. Run: python docs/ui-v2/comps/build.py"""
import pathlib

here = pathlib.Path(__file__).parent
core = (here / "src" / "core.js").read_text(encoding="utf-8")
for src in sorted((here / "src").glob("comp-*.html")):
    out = src.read_text(encoding="utf-8").replace("/*CORE*/", core)
    (here / src.name).write_text(out, encoding="utf-8")
    print(src.name, len(out), "bytes")
