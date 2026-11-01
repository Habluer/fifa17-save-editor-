# Segurança

- O app lê arquivos locais; a interface não tem acesso direto ao sistema de arquivos.
- Gravações exigem o FIFA fechado, limites válidos, verificação de integridade e backup. Saves alterados após a abertura são recusados.
- Backups ficam junto dos saves. Falhas de energia, sincronização na nuvem e formatos diferentes ainda podem causar problemas; mantenha cópias independentes.
- O executável não tem assinatura digital. Compatibilidade com outros FIFAs não foi validada.

Para verificar dependências, execute `npm audit --audit-level=low`. O workflow também executa essa auditoria antes da release; um resultado sem alertas não garante ausência de vulnerabilidades.

Não publique saves reais, dados pessoais ou credenciais em issues. Para vulnerabilidades, use o canal privado de segurança do GitHub, se habilitado; inclua uma reprodução mínima sem dados pessoais.
