import mongoose from 'mongoose';

export const connectToDatabase = (mongodbURL: string) => {
  return mongoose.connect(mongodbURL);
};