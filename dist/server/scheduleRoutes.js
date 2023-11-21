"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const schedModel_1 = require("../models/schedModel");
const router = express_1.default.Router();
router.get('/schedule', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const schedules = yield schedModel_1.Schedule.find({});
        res.status(200).json({
            count: schedules.length,
            data: schedules,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send({});
    }
}));
router.post('/schedule', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { date, leader, backup1, backup2, acoustic, electric, keyboard, bass, drums } = req.body;
        if (!date || !leader || !backup1 || !backup2 || !acoustic || !bass || !drums) {
            return res.status(400).json({
                message: 'Send required fields',
            });
        }
        const newSched = yield schedModel_1.Schedule.create({ date, leader, backup1, backup2, acoustic, electric, keyboard, bass, drums });
        res.status(201).json(newSched);
    }
    catch (error) {
        console.error(error);
        res.status(500).send({});
    }
}));
router.put('/schedule/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const id = req.params.id;
    try {
        const { date, leader, backup1, backup2, acoustic, electric, keyboard, bass, drums } = req.body;
        if (!date || !leader || !backup1 || !backup2 || !acoustic || !bass || !drums) {
            return res.status(400).json({
                message: 'Send required fields',
            });
        }
        const updatedSched = yield schedModel_1.Schedule.findByIdAndUpdate(id, { date, leader, backup1, backup2, acoustic, electric, keyboard, bass, drums }, { new: true });
        res.status(201).json(updatedSched);
    }
    catch (error) {
        console.error(error);
        res.status(500).send({});
    }
}));
router.delete('/schedule/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const id = req.params.id;
    try {
        const deletedSched = yield schedModel_1.Schedule.findByIdAndDelete(id);
        if (!deletedSched) {
            return res.status(404).json({ error: 'ID not found' });
        }
        res.status(201).send('Schedule deleted successfully');
    }
    catch (error) {
        console.error(error);
        res.status(500).send({});
    }
}));
exports.default = router;
