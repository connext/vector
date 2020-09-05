// NOTE: These are very simple type-specific utils
// To prevent cyclic dependencies, these should not be moved to the utils module

// stolen from https://github.com/microsoft/TypeScript/issues/3192#issuecomment-261720275
export const enumify = <T extends { [index: string]: U }, U extends string>(x: T): T => x;

export const tidy = (str: string): string => `${str.replace(/\n/g, "").replace(/ +/g, " ")}`;