# Vendored copy

Copied from the owner's own project `jflap-cli` (MIT, see LICENSE; first commit 2026-11-13). Only the runtime files are included: the CLI, the MCP server, the JVM bridge client, the builder and `JFLAPBridge.java`. Git history, examples, docs and tests were not copied.

`third_party/jflap/JFLAP7.1.jar` is the unmodified official JFLAP 7.1 jar (SHA-256 `A22C095DDC56B18163E8EBEEEF165B3A04CB570F35EB46B96105166E06C99406`, identical to https://www.jflap.org/jflaptmp/july27-18/JFLAP7.1.jar). It is redistributed under the JFLAP 7.1 license in `third_party/jflap/LICENSE-JFLAP` (copied from https://www.jflap.org/jflaptmp/july27-18/license.html): unmodified copies may be distributed if the license text is included and no fee is charged for any product that includes JFLAP.

`JFLAPBridge.class` is compiled on first use (needs a JDK, `javac` on PATH) and is git-ignored.
