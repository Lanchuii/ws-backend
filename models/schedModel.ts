import { Schema, model } from "mongoose";

interface ISchedule {
  date: Date;
  leader: string;
  backup1: string;
  backup2: string;
  acoustic: string;
  electric: string;
  keyboard: string;
  bass: string;
  drums: string;
}

const schedSchema = new Schema(
  {
    date: {type: Date, required: true},
    leader: { type: String, required: true },
    backup1: { type: String, required: true },
    backup2: { type: String, required: true },
    acoustic: { type: String, required: true },
    electric: { type: String, required: true },
    keyboard: { type: String, required: true },
    bass: { type: String, required: true },
    drums: { type: String, required: true }
  }
)

export const Schedule = model<ISchedule>('User', schedSchema);