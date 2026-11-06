# Contributing

Thanks for helping the trees grow.

## Setup

```sh
git clone https://github.com/SRojas22/QR_Tree.git
cd QR_Tree
npm install
npm run dev
```

`npm run dev` serves the demo pages in `examples/` against the live source, so changes in `src/` show up right away.

## Before you open a pull request

```sh
npm run typecheck
npm test
npm run build
```

CI runs the same three.

## Guidelines

- **The code must still scan.** Anything that touches `code.ts`, module positions, colours or the camera should be checked with a phone in code mode, on at least one long URL.
- **Keep it small.** The library is a single class with no runtime dependencies besides `three` and `qrcode`. Please talk it through in an issue before adding a dependency.
- **New trees** go in `trees.ts` (the shape) and `looks.ts` (the palette). A grower must return exactly the number of leaves it is asked for, and the tests check that.
- **Match the code around you.** Short names, few comments, and comments that explain why rather than what.
- Add a line to `CHANGELOG.md` under "Unreleased".

## Reporting bugs

Open an issue with your browser and device, the text you encoded, and a screenshot or recording if you can.
