import { Schema, model } from "mongoose";

interface ISchedule {
  date: string;
  leader: string;
  acoustic: string;
}

const schedSchema = new Schema(
  {
    leader: { type: String, required: true },
    acoustic: { type: String, required: true }
  }
)

export const Schedule = model<ISchedule>('User', schedSchema);