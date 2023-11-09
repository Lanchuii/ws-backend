"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_js_1 = require("./config.js");
const app = (0, express_1.default)();
app.get('/', (request, response) => {
    console.log(request);
    return response.status(234).send("Welcome to your TypeScript API");
});
app.listen(config_js_1.PORT, () => {
    console.log(`Listening to Port: ${config_js_1.PORT}`);
});
