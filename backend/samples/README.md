# Sample resumes

Six **synthetic** resumes (invented people, `example.com` addresses) in different
layouts, with hand-written ground truth in `expected.json`. They exist to:

* seed a demo database (`python -m app.seed`), and
* regression-test the rule-based parser: `python -m app.eval_parsing`.

They are a regression suite, **not** an accuracy benchmark. The parser was tuned
while these were in front of it, so a perfect score here says nothing about
unseen real-world resumes. Real resumes contain personal data and are never
committed.
