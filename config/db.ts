import mongoose from 'mongoose';

export const connectToDatabase = (mongodbURL: string) => {
  return mongoose.connect(mongodbURL);
};

interface DbConfig {
  databaseUrl: string;
}

const getDbConfig = (): DbConfig => {
  return {
    databaseUrl: process.env.NODE_ENV === 'production'
      ? process.env.MONGODB_URL || ''
      : process.env.DEV_MONGODB_URL || 'mongodb://localhost:27017/ws-db',
  };
};

export default getDbConfig;