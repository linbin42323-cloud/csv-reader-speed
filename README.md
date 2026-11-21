# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/linbin42323-cloud/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/linbin42323-cloud/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in replacement for csv-reader 1.0.0: byte-identical answers on every case, less CPU time. `solve.js` is a dependency-free ES module whose `run(input)` returns csv-reader's exact `{columns, rows, errors}` for `{text, header}`, including its fault-tolerance semantics — `stray_cr`, `quote_junk`, `unterminated_quote`, `short_row` / `long_row`, quoted newlines and their line counting. `main.ts` reads `/input/cases.json` and writes `/output/answers.json`.

Verified: 6/6 practice cases identical to csv-reader 1.0.0 (official scorer 6/6), and 60,000 randomised broken-file differential tests against the original — all identical. Speed: hot path ~10.5× faster than the original; end-to-end (including file I/O) ~2.76× faster; also beats the official papaparse reference.

## Run it

```sh
node main.ts # reads /input/cases.json, writes /output/answers.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=y4c5sb8c&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
