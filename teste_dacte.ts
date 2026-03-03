import { DACTE } from './src/libs/dacte';
import fs from 'fs';

const xml = fs.readFileSync('./DACTE_dummy.xml', 'utf8');

DACTE({ xml }).then(pdfBytes => {
    fs.writeFileSync('./exemplos/DACTE_novo_layout.pdf', pdfBytes);
    console.log('DACTE PDF generated successfully at ./exemplos/DACTE_novo_layout.pdf');
}).catch(err => {
    console.error('Error generating DACTE PDF:', err);
});
