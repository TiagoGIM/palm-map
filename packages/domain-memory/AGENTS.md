# domain-memory Instructions

- Comece com preferencias explicitas do usuario.
- Nao inferir preferencias implicitas no MVP.
- Apenas registrar preferencias explicitamente declaradas.

- Mantenha schema simples e facil de evoluir.
- Evite memoria episodica complexa no MVP.

- Ao atualizar memoria, evitar duplicacoes e conflitos.
- Preferir merge simples em vez de sobrescrita total.

- Memoria deve influenciar, mas nao dominar a decisao do sistema.
- Dados grounded do retrieval devem ter prioridade.

- Nao acople diretamente a camada ao frontend.
- Prefira contratos claros para leitura e escrita de preferencias.
- Mantenha os registros simples, auditaveis e alinhados aos contratos compartilhados quando eles existirem.
