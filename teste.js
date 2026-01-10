import { DANFe, DANFCe } from './src/index';
import fs from "fs"
DANFe({ xml: fs.readFileSync("./public/DANFE.xml", { encoding: "utf8" }) }).then(res => {
    fs.writeFileSync("./exemplos/DANFe_teste.pdf",res)
});