// Shared by the local UI and tests. Physical dimensions and potential never enter bulk edits.
(function(root) {
  const definitions = {
    acceleration: ['Aceleração','Físico','Rapidez para atingir a velocidade de corrida.'],
    sprintspeed: ['Pique','Físico','Velocidade máxima ao correr.'],
    agility: ['Agilidade','Físico','Facilidade para mudar de direção e movimentar o corpo.'],
    balance: ['Equilíbrio','Físico','Capacidade de manter estabilidade durante movimentos e disputas.'],
    jumping: ['Impulsão','Físico','Capacidade de salto nas disputas aéreas.'],
    stamina: ['Fôlego','Físico','Resistência ao esforço ao longo da partida.'],
    strength: ['Força','Físico','Capacidade física nas disputas de corpo.'],
    reactions: ['Reações','Mental','Rapidez de resposta às situações da partida.'],
    aggression: ['Agressividade','Mental','Intensidade nas disputas pela bola.'],
    positioning: ['Posicionamento','Mental','Movimentação e posicionamento ofensivo sem a bola.'],
    vision: ['Visão','Mental','Capacidade de perceber opções de passe.'],
    composure: ['Frieza','Mental','Execução das ações sob pressão.'],
    interceptions: ['Interceptações','Defesa','Capacidade de cortar passes adversários.'],
    standingtackle: ['Desarme em pé','Defesa','Precisão ao tentar recuperar a bola sem carrinho.'],
    slidingtackle: ['Carrinho','Defesa','Precisão ao recuperar a bola com um carrinho.'],
    marking: ['Marcação','Defesa','Acompanhamento e cobertura do adversário.'],
    penalties: ['Pênaltis','Finalização','Precisão nas cobranças de pênalti.'],
    finishing: ['Finalização','Finalização','Precisão dos chutes em situações de finalização.'],
    shotpower: ['Força do chute','Finalização','Potência aplicada ao chute.'],
    longshots: ['Chutes de longe','Finalização','Precisão dos chutes de longa distância.'],
    volleys: ['Voleios','Finalização','Precisão dos chutes com a bola no ar.'],
    headingaccuracy: ['Cabeceio','Finalização','Precisão ao direcionar a bola com a cabeça.'],
    crossing: ['Cruzamento','Técnica','Precisão ao cruzar a bola para companheiros.'],
    freekickaccuracy: ['Cobrança de falta','Técnica','Precisão nas cobranças de falta.'],
    shortpassing: ['Passe curto','Técnica','Precisão nos passes de curta distância.'],
    longpassing: ['Passe longo','Técnica','Precisão nos passes de longa distância.'],
    curve: ['Curva','Técnica','Capacidade de aplicar efeito à trajetória da bola.'],
    dribbling: ['Drible','Técnica','Condução da bola durante os dribles.'],
    ballcontrol: ['Controle de bola','Técnica','Domínio e recepção da bola.'],
    height: ['Altura (cm)','Dados físicos','Dimensão corporal. Nunca é alterada pelos botões de edição em lote.'],
    weight: ['Peso (kg)','Dados físicos','Massa corporal. Nunca é alterada pelos botões de edição em lote.'],
    potential: ['Potencial','Progressão','Referência de evolução do jogador. Fica fora da edição em lote.']
  };
  const bulkKeys = Object.keys(definitions).filter(key => !['height','weight','potential'].includes(key));
  function bulkEdit(values, selected, operation, amount) {
    if (!['set','add','max'].includes(operation) || !Array.isArray(selected)) throw new Error('Operação em lote inválida.');
    if (operation !== 'max' && (!Number.isInteger(amount) || amount < (operation === 'add' ? -98 : 1) || amount > 99)) throw new Error('Informe um número inteiro válido.');
    const result = { ...values };
    for (const key of selected) {
      if (!bulkKeys.includes(key) || !Number.isInteger(values[key])) continue;
      result[key] = operation === 'max' ? 99 : Math.min(99, Math.max(1, operation === 'add' ? values[key] + amount : amount));
    }
    return result;
  }
  const api = { definitions, bulkKeys, bulkEdit };
  if (typeof module !== 'undefined') module.exports = api;
  else root.attributeTools = api;
})(globalThis);
