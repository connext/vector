import { EtherSymbol } from "@ethersproject/constants";
import { BigNumber } from "@ethersproject/bignumber";
import { commify, parseUnits, formatUnits } from "@ethersproject/units";

export class Currency {
  ////////////////////////////////////////
  // Static Properties/Methods

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public static DAI = (amount: any, daiRate?: any) => new Currency("DAI", amount, daiRate);
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public static DEI = (amount: any, daiRate?: any) => new Currency("DEI", amount, daiRate);
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public static ETH = (amount: any, daiRate?: any) => new Currency("ETH", amount, daiRate);
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public static FIN = (amount: any, daiRate?: any) => new Currency("FIN", amount, daiRate);
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public static WEI = (amount: any, daiRate?: any) => new Currency("WEI", amount, daiRate);

  public typeToSymbol = {
    DAI: "$",
    DEI: "DEI ",
    ETH: EtherSymbol,
    FIN: "FIN ",
    WEI: "WEI ",
  };

  public defaultOptions = {
    DAI: { commas: false, decimals: 2, symbol: true, round: true },
    DEI: { commas: false, decimals: 0, symbol: false, round: true },
    ETH: { commas: false, decimals: 3, symbol: true, round: true },
    FIN: { commas: false, decimals: 3, symbol: false, round: true },
    WEI: { commas: false, decimals: 0, symbol: false, round: true },
  };

  ////////////////////////////////////////
  // Private Properties

  // wad is in units like MakerDAO's wad aka an integer w 18 extra units of precision
  // ray is in units like MakerDAO's ray aka an integer w 36 extra units of precision
  // So: this.wad is to the currency amount as wei is to an ether amount
  // These let us handle divisions & decimals cleanly w/out needing a BigDecimal library
  public wad: BigNumber;
  public ray: BigNumber;
  public type: string;

  public daiRate: string;
  public daiRateGiven: boolean;

  ////////////////////////////////////////
  // Constructor

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  constructor(type: string, amount: any, daiRate?: any) {
    this.type = type;
    this.daiRate = typeof daiRate !== "undefined" ? daiRate : "1";
    this.daiRateGiven = !!daiRate;
    try {
      this.wad = this.toWad(amount._hex ? BigNumber.from(amount._hex) : amount);
      this.ray = this.toRay(amount._hex ? BigNumber.from(amount._hex) : amount);
    } catch (e) {
      throw new Error(`Invalid currency amount (${amount}): ${e}`);
    }
  }

  ////////////////////////////////////////
  // Getters

  // Returns a decimal string
  get amount(): string {
    return this.fromWad(this.wad);
  }

  get currency(): { amount: string; type: string; } {
    return {
      amount: this.amount,
      type: this.type,
    };
  }

  get symbol(): string {
    return this.typeToSymbol[this.type];
  }

  get floor(): string {
    return this._floor(this.amount);
  }

  ////////////////////////////////////////
  // Public Methods

  public toString(): string {
    return this.amount.slice(0, this.amount.indexOf("."));
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public isEthType(type?: any): boolean {
    return ["ETH", "FIN", "WEI"].includes(type || this.type);
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public isTokenType(type?: any): boolean {
    return ["DAI", "DEI"].includes(type || this.type);
  }

  public toBN(): BigNumber {
    return BigNumber.from(this._round(this.amount));
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public format(_options?: any): string {
    const amt = this.amount;
    const options = {
      ...this.defaultOptions[this.type],
      ...(_options || {}),
    };
    const symbol = options.symbol ? `${this.symbol}` : "";
    const nDecimals = amt.length - amt.indexOf(".") - 1;
    const amount = options.round
      ? this.round(options.decimals)
      : options.decimals > nDecimals
      ? amt + "0".repeat(options.decimals - nDecimals)
      : options.decimals < nDecimals
      ? amt.substring(0, amt.indexOf(".") + options.decimals + 1)
      : amt;
    return `${symbol}${options.commas ? commify(amount) : amount}`;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public round(decimals: any): string {
    const amt = this.amount;
    const nDecimals = amt.length - amt.indexOf(".") - 1;
    // rounding to more decimals than are available: pad with zeros
    if (typeof decimals === "number" && decimals > nDecimals) {
      return amt + "0".repeat(decimals - nDecimals);
    }
    // rounding to fewer decimals than are available: round
    // Note: rounding n=1099.9 to nearest int is same as floor(n + 0.5)
    // roundUp plays same role as 0.5 in above example
    if (typeof decimals === "number" && decimals < nDecimals) {
      const roundUp = BigNumber.from(`5${"0".repeat(18 - decimals - 1)}`);
      const rounded = this.fromWad(this.wad.add(roundUp));
      return rounded.slice(0, amt.length - (nDecimals - decimals)).replace(/\.$/, "");
    }
    // rounding to same decimals as are available: return amount w no changes
    return this.amount;
  }

  // In units of ray aka append an extra 36 units of precision
  // eg ETH:WEI rate is 1e18 ray aka 1e54
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public getRate = (currency: any): string => {
    const exchangeRates = {
      DAI: this.toRay(this.daiRate),
      DEI: this.toRay(parseUnits(this.daiRate, 18).toString()),
      ETH: this.toRay("1"),
      FIN: this.toRay(parseUnits("1", 3).toString()),
      GWEI: this.toRay(parseUnits("1", 9).toString()),
      WEI: this.toRay(parseUnits("1", 18).toString()),
    };
    if (
      (this.isEthType() && this.isEthType(currency)) ||
      (this.isTokenType() && this.isTokenType(currency))
    ) {
      return exchangeRates[currency];
    }
    if (!this.daiRateGiven) {
      console.warn(`Provide DAI:ETH rate for accurate ${this.type} -> ${currency} conversions`);
      console.warn(`Using default eth price of $${this.daiRate} (amount: ${this.amount})`);
    }
    return exchangeRates[currency];
  };

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public toDAI = (daiRate?: any) => this._convert("DAI", daiRate);
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public toDEI = (daiRate?: any) => this._convert("DEI", daiRate);
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public toETH = (daiRate?: any) => this._convert("ETH", daiRate);
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public toFIN = (daiRate?: any) => this._convert("FIN", daiRate);
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public toWEI = (daiRate?: any) => this._convert("WEI", daiRate);
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public toGWEI = (daiRate?: any) => this._convert("GWEI", daiRate);

  ////////////////////////////////////////
  // Private Methods

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public _convert = (targetType: any, daiRate?: any): Currency => {
    if (daiRate) {
      this.daiRate = daiRate;
      this.daiRateGiven = true;
    }
    const thisToTargetRate = this.toRay(this.getRate(targetType)).div(this.getRate(this.type));
    const targetAmount = this.fromRay(this.fromRoundRay(this.ray.mul(thisToTargetRate)));
    // console.debug(`Converted: ${this.amount} ${this.type} => ${targetAmount} ${targetType}`)
    return new Currency(
      targetType,
      targetAmount.toString(),
      this.daiRateGiven ? this.daiRate : undefined,
    );
  };

  // convert to wad, add 0.5 wad, convert back to dec string, then truncate decimal
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public _round = (decStr: any): string =>
    this._floor(this.fromWad(this.toWad(decStr).add(this.toWad("0.5"))).toString());

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public _floor = (decStr: any): string => decStr.substring(0, decStr.indexOf("."));

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public toWad = (n: any): BigNumber => parseUnits(n.toString(), 18);

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public toRay = (n: any): BigNumber => this.toWad(this.toWad(n.toString()));

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public fromWad = (n: any): string => formatUnits(n.toString(), 18);

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public fromRoundRay = (n: any): string => this._round(this.fromRay(n));

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public fromRay = (n: any): string => this.fromWad(this._round(this.fromWad(n.toString())));
}
