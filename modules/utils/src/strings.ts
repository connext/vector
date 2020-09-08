export const abbreviate = (str?: string, len = 4): string =>
  !str ? "undefined"
    : str.startsWith("indra") ? `${str.substring(0, 5 + len)}..${str.substring(str.length - len)}`
    : str.startsWith("0x") ? `${str.substring(0, 2 + len)}..${str.substring(str.length - len)}`
    : `${str.substring(0, len)}..${str.substring(str.length - len)}`;

export const abrv = (str?: string, len = 4): string => abbreviate(str, len);

export const capitalize = (str: string): string => str.charAt(0).toUpperCase() + str.substring(1);
