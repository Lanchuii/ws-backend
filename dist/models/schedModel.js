"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Schedule = void 0;
const mongoose_1 = require("mongoose");
const schedSchema = new mongoose_1.Schema({
    date: { type: Date, required: true },
    leader: { type: String, required: true },
    backup1: { type: String, required: true },
    backup2: { type: String, required: true },
    acoustic: { type: String, required: true },
    electric: { type: String, required: false },
    keyboard: { type: String, required: false },
    bass: { type: String, required: true },
    drums: { type: String, required: true }
});
exports.Schedule = (0, mongoose_1.model)('Main', schedSchema);
