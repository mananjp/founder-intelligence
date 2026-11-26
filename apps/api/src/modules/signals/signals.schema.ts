import { z } from "zod";
import { SignalStrength, SignalType } from "@fi/contracts";

export const listSignalsQuery = z.object({
  signalType: SignalType.optional(),
  strength: SignalStrength.optional(),
});
export type ListSignalsQuery = z.infer<typeof listSignalsQuery>;
