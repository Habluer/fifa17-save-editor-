# Mapa do código e adaptação

## Onde mexer

| Arquivo | Responsabilidade |
| --- | --- |
| `save-editor.js` | Formato FIFA 17, leitura binária, campos, CRCs, edição e backups |
| `attributes.js` | Nomes, explicações, grupos e atributos permitidos no lote |
| `main.js` | Janela Electron, seletor nativo e operações de arquivo autorizadas |
| `preload.js` | API limitada entre a interface e o processo principal |
| `renderer.js`, `index.html`, `style.css` | Interface, valores ainda não salvos e confirmação |
| `save-folder.js` | Preferência local de pasta; não contém nem copia os saves |

## O que é específico do FIFA 17

O contêiner `FBCHUNKS` contém bancos com assinatura `DB`. Tabelas e campos usam identificadores de quatro bytes: `KNOWN_TABLES` e `FIELD_MAP` traduzem os que este editor reconhece. Campos inteiros são compactados em bits e podem ter um valor mínimo somado ao número armazenado; por exemplo, altura usa base 130. `unsignedAt` e `writeUnsigned` cuidam desses bits sem alterar os campos vizinhos.

`dbSections` valida limites; `locate` encontra o jogador pelo ID da carreira, sem fixar um ID de personagem. O CRC usado é CRC-32/MPEG-2 (polinômio `0x04C11DB7`, inicial `0xFFFFFFFF`, sem reflexão nem XOR final). `refreshCrcs` atualiza cabeçalhos, diretório e corpos das tabelas.

Altura e peso também aparecem em um registro físico fora dos bancos. `readPhysicalRecord` confere assinatura, ID e intervalos antes de aceitar os offsets 1406/1410. Alterar somente a tabela pode não produzir efeito no jogo. O título e as áreas de integridade do contêiner também têm regras próprias: veja `readSaveTitle`, `markEditedName` e `invalidateContainerIntegrity`.

## Para outro FIFA

1. Use carreiras descartáveis, com uma diferença conhecida por vez. Compare arquivos originais e preserve cópias.
2. Identifique contêiner, versão, bancos, tabelas, IDs, codificação e campos duplicados. Não reutilize offsets do FIFA 17 por suposição.
3. Confirme tamanho, sinal, base e profundidade de cada campo e os checksums do formato.
4. Acrescente um módulo de formato separado quando houver uma segunda implementação real. Hoje o código do save já é independente da UI; não é preciso mudar Electron para estudar o formato.
5. Teste arquivo malformado, limites, backup/restauração e recusa de progresso alterado. Depois confira o resultado no jogo, jogue, salve e recarregue: reler o arquivo sozinho não comprova persistência.

Mantenha a API de alto nível (`inspectSave`, `applySave`, `listBackups`, `restoreBackup`) e a proteção de gravação. Não habilite um formato novo só por trocar constantes. Compartilhe fixtures sintéticos ou anonimizados, nunca saves pessoais.

## Ferramentas de build

O package.json fixa overrides de `asar`, `universal`, `minimatch` e `glob` para versões corrigidas de avisos de segurança. Atualize-os com o lockfile e valide `npm ci`, `npm audit`, testes e o ZIP Windows. Eles são ferramentas de desenvolvimento, não bibliotecas distribuídas no app. O suporte de build validado é Windows x64.
