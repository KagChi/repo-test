import { greet, padStart, sum } from "@repo/shared-utils";

const values = [1, 2, 3];
const total = sum(...values);

console.log(greet("web"));
console.log(`sum(${values.join(", ")}) = ${padStart(total, 2)}`);
