# LockerGo Frontend

Frontend de LockerGo desarrollado con Angular 22, TypeScript 6, SCSS, Chart.js y ng2-charts.

La autenticación usa un access token en memoria y un refresh token en cookie `httpOnly`; no se guardan tokens en `localStorage`.

## Development server

Run `bun install` and then `bun run start` for a dev server at `http://localhost:4200/`. The application automatically reloads when source files change.

## Code scaffolding

Run `bun run ng generate component component-name` to generate a new component. Use the same command with `directive`, `pipe`, `service`, `class`, `guard`, `interface`, `enum` or `module`.

## Build

Run `bun run build` to build the project. The build artifacts are stored in the `dist/` directory.

## Running unit tests

Run `bun run test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
