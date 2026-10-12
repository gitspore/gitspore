import type { Config } from "jest";
import { pathsToModuleNameMapper } from "ts-jest";
import ts from "typescript";

// Path aliases live in tsconfig.json, so they are read from there
// instead of being duplicated here.
const { config: tsconfig } = ts.readConfigFile(
  "./tsconfig.json",
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts", "tsx"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.tsx?$",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
  moduleNameMapper: pathsToModuleNameMapper(paths, { prefix: "<rootDir>/" }),
  testEnvironment: "node",
};

export default config;
