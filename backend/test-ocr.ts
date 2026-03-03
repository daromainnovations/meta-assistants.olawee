import { documentAnalysisService } from "./src/services/shared/document-analysis.service";
import * as fs from "fs";
import 'dotenv/config';

async function test() {
    try {
        const filePath = "../J57 DAVID.pdf"; // where is it? Let's check parent dir.
        if (fs.existsSync(filePath)) {
            const buffer = fs.readFileSync(filePath);
            const res = await documentAnalysisService.transcribePDF(buffer);
            console.log("Success:", res.substring(0, 500));
        } else {
            console.log("File not found at", filePath);
        }
    } catch (e) {
        console.error("Error:", e);
    }
};

test();
