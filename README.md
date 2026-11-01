# FIFA 17 Save Editor

Editor offline do modo **Carreira de Jogador do FIFA 17 para Windows**. Edita atributos, altura e peso, com backup antes de gravar. Não usa Cheat Engine nem altera a instalação do jogo.

## Usar

1. [Baixe o ZIP em Releases](https://github.com/Habluer/fifa17-save-editor-/releases/latest) e extraia tudo para uma pasta gravável.
2. Abra `FIFA17 Career Editor.exe` e escolha a pasta em **Minhas carreiras**, ou use **Abrir arquivo**.
3. Feche o FIFA, edite os valores e confirme em **Revisar e aplicar**.
4. No jogo, procure o save com o título **EDITADO**. Para desfazer, use **Restaurar backup**.

Altura, peso e potencial ficam fora da edição em lote. Guarde cópias independentes das carreiras importantes. A edição de peso tem testes de arquivo, mas a persistência no jogo ainda precisa de confirmação.

As configurações ficam em `data`, ao lado do EXE. Para remover, feche o app e apague a pasta extraída; seus saves e backups continuam na pasta escolhida.

## Desenvolver ou adaptar

Node.js **22.12+**:

```sh
npm ci
npm test
npm start
npm run dist
```

`npm run dist` gera o ZIP em `dist`. Os testes de arquivo e interface usam um save local indicado em `FIFA17_TEST_SAVE`, sempre por cópias temporárias; nunca envie saves pessoais ao repositório. `npm run test:ui` exige essa variável.

O suporte atual é **somente FIFA 17**. O projeto pode servir de base para outros jogos, mas seus formatos e checksums precisam ser investigados: [mapa do código e guia de adaptação](docs/ADAPTAR.md).

Licença [MIT](LICENSE). Projeto independente, sem vínculo com EA Sports. Veja [Segurança](SECURITY.md).
