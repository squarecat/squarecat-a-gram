import countries from '../geo/countries.json';

export interface Country {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export const COUNTRIES = countries as Country[];

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
export const findCountry = (code?: string): Country | undefined =>
  code ? byCode.get(code) : undefined;
