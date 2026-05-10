import fs from 'fs';

export interface SampleInterface {
  name: string;
}

export class SampleClass {
  greet(msg: string): string {
    return `hello ${msg}`;
  }
}

export function sampleFunction(x: number): number {
  return x * 2;
}

function internalHelper(): void {
  // not exported
}
