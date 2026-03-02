# Avaliação Técnica do DANFe.ts

Esta análise detalha o estado atual da implementação do DANFe e identifica lacunas técnicas, funcionais e de arquitetura que podem ser melhoradas.

## 1. Arquitetura e Organização do Código

*   **Monolito**: A função [DANFe](file:///d:/GitHub/node-sped-pdf/src/libs/danfe.ts#23-896) é um fechamento (closure) gigante com quase 900 linhas. Isso dificulta a manutenção e o teste unitário de partes específicas (como o cálculo de impostos ou a lógica de quebra de página).
*   **Acoplamento de Helpers**: Funções como [addTXT](file:///d:/GitHub/node-sped-pdf/src/libs/danfe.ts#153-220), [addRet](file:///d:/GitHub/node-sped-pdf/src/libs/danfe.ts#112-122) e [wrapText](file:///d:/GitHub/node-sped-pdf/src/libs/danfe.ts#222-244) estão replicadas (ou deveriam ser compartilhadas) entre [danfe.ts](file:///d:/GitHub/node-sped-pdf/src/libs/danfe.ts), [danfce.ts](file:///d:/GitHub/node-sped-pdf/src/libs/danfce.ts) e [dav55.ts](file:///d:/GitHub/node-sped-pdf/src/libs/dav55.ts). Elas devem ser movidas para um arquivo de utilitários comum (ex: `src/libs/utils/pdf-helpers.ts`).
*   **Lógica de Blocos**: Os [bloco0](file:///d:/GitHub/node-sped-pdf/src/libs/danfe.ts#303-320) a [bloco8](file:///d:/GitHub/node-sped-pdf/src/libs/danfe.ts#785-794) poderiam ser transformados em componentes de layout ou classes, permitindo uma composição mais dinâmica.

## 2. Suporte a Impostos (ICMS/IPI/ISSQN)

*   **Extração de Impostos**: A lógica atual no [bloco6](file:///d:/GitHub/node-sped-pdf/src/libs/danfe.ts#686-765) usa um "hack" de operadores OR para tentar encontrar qualquer tipo de ICMS (`ICMS00`, `ICMS10`, `ICMSSN102`, etc). Isso é frágil. Seria melhor ter um extrator dedicado que normalize as diferentes tags de ICMS em um modelo padrão.
*   **ISSQN**: Falta a seção de Totais do ISSQN, necessária para notas que envolvem serviços.
*   **PIS / COFINS / FCP**: Detalhes destes impostos não estão sendo exibidos nas colunas de itens ou nos totais de forma detalhada (apenas o valor total da nota).
*   **Impostos Retidos**: A exibição de impostos retidos na fonte (IRRF, CSLL, etc) não parece estar completa.

## 3. Funcionalidades e Seções Faltantes

*   **NFe Referenciada**: Importante para notas de devolução ou complementares. A lista de chaves de acesso referenciadas deve aparecer nos Dados Adicionais ou em bloco próprio.
*   **Local de Entrega / Retirada**: Seções obrigatórias quando o endereço de operação é diferente do endereço do destinatário/emitente.
*   **Informações de Itens Específicos**:
    *   Rastreabilidade (Lote, Data de Fabricação/Validade).
    *   Combustíveis (CIDE, etc).
    *   Veículos (Chassi, etc).
*   **QR Code**: Embora obrigatório no NFC-e, o DANFe 4.0 sugere o uso de QR Code para facilitar a consulta. Atualmente, apenas o código de barras é gerado.

## 4. Layout e Robustez

*   **Quebra de Página**: O [bloco6](file:///d:/GitHub/node-sped-pdf/src/libs/danfe.ts#686-765) faz uma gestão de quebra baseada em contagem de linhas estimada. Isso funciona, mas pode falhar com textos muito longos que não se comportam como o esperado.
*   **Normalização de Dados**: A normalização case-insensitive que adicionei resolve erros de execução, mas uma camada de "Transformer" que limpe e valide o XML antes de enviar para o gerador de PDF seria o ideal.
*   **Internacionalização/Localização**: Formatações de moeda e data estão espalhadas pelo código. Centralizá-las em formatadores padrão ajudaria na consistência.

## Próximos Passos Sugeridos

1.  **Refatoração de Helpers**: Mover funções de desenho e texto para um arquivo comum.
2.  **Módulo de Impostos**: Criar uma lógica robusta para extrair ICMS/ISSQN independente da versão do layout (Simples Nacional vs Normal).
3.  **Adição de Seções Missing**: Implementar NFe Referenciada e Local de Entrega.
4.  **Suporte a DACTE (CTe)**: Após terminar o DANFe, implementar o suporte para DACTE seguindo os mesmos padrões.
