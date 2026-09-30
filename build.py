#!/usr/bin/env python3
"""Inline Matter.js + game.js into src/template.html -> index.html (single self-contained file)."""
import pathlib, sys
root = pathlib.Path(__file__).parent
matter = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / "src/matter.min.js").read_text()
t = (root / "src/template.html").read_text()
g = (root / "src/game.js").read_text()
out = t.replace("/*MATTER*/", matter.replace("</script", "<\\/script")).replace("/*GAME*/", g.replace("</script", "<\\/script"))
(root / "index.html").write_text(out)
print("wrote index.html", len(out) // 1024, "KB")
