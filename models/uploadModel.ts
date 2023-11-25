import { Schema, model } from "mongoose";

interface IUpload {
  a: string;
  b: number;
  c: string;
}

const uploadSchema = new Schema(
  {
    a: { type: String, required: true },
    b: { type: Number, required: true },
    c: { type: String, required: true }
  }
)

export const Upload = model<IUpload>('new', uploadSchema);