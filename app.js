const statClamp = (value) => Math.min(100, Math.max(0, value));
const clampProb = (value) => Math.min(95, Math.max(5, value));
const randRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pickRandom = (array) => array[Math.floor(Math.random() * array.length)];
const round1 = (value) => Math.round(value * 10) / 10;

const ITEMS = [
  "Herramientas",
  "Oro",
  "Armas",
  "Reliquias",
  "Contactos",
  "Medicinas",
];

const GROUP_NAMES = ["Clero", "Guarnición", "Siervos", "Burguesía", "Población Civil"];

const state = {
  day: 1,
  food: 5,
  water: 5,
  inventory: [],
  castle: {
    pressure: 0,
    pressureCounter: 0,
  },
  groups: [],
  eventQueue: [],
  delayedEvents: [],
  expeditionOfferDay: 2,
};

const ui = {
  day: document.getElementById("day"),
  nextDay: document.getElementById("next-day"),
  castle: document.getElementById("castle"),
  food: document.getElementById("food"),
  water: document.getElementById("water"),
  inventory: document.getElementById("inventory"),
  groups: document.getElementById("groups"),
  log: document.getElementById("log"),
  modal: document.getElementById("event-modal"),
  eventTitle: document.getElementById("event-title"),
  eventDescription: document.getElementById("event-description"),
  eventActions: document.getElementById("event-actions"),
};

const logEntry = (message) => {
  const p = document.createElement("p");
  p.innerHTML = message;
  ui.log.prepend(p);
};

const initGame = () => {
  state.inventory = pickInitialItems();
  state.groups = GROUP_NAMES.map((name) => createGroup(name));
  render();
  logEntry("Comienza la defensa del castillo.");
};

const pickInitialItems = () => {
  const copy = [...ITEMS];
  const selection = [];
  while (selection.length < 3) {
    const index = randRange(0, copy.length - 1);
    selection.push(copy.splice(index, 1)[0]);
  }
  return selection;
};

const createGroup = (name) => ({
  name,
  population: 100,
  loyalty: 100,
  thirst: 0,
  hunger: 0,
  dead: false,
  onExpedition: false,
  expeditionReturn: null,
  returnThirst: false,
  returnHunger: false,
  counters: {
    popFinal: 0,
    loyaltyNeg: 0,
    loyaltyFinal: 0,
    thirstFinal: 0,
    hungerFinal: 0,
  },
});

const statusFromValue = (value, thresholds) => {
  for (const threshold of thresholds) {
    if (threshold.check(value)) return threshold.label;
  }
  return thresholds[thresholds.length - 1].label;
};

const getGroupStates = (group) => ({
  population: statusFromValue(group.population, [
    { label: "Próspera", check: (value) => value >= 50 },
    { label: "Diezmada", check: (value) => value >= 25 },
    { label: "Crítica", check: () => true },
  ]),
  loyalty: statusFromValue(group.loyalty, [
    { label: "Fieles", check: (value) => value >= 50 },
    { label: "Descontentos", check: () => true },
  ]),
  thirst: statusFromValue(group.thirst, [
    { label: "Abastecidos", check: (value) => value < 50 },
    { label: "Sedientos", check: (value) => value <= 80 },
    { label: "Deshidratados", check: () => true },
  ]),
  hunger: statusFromValue(group.hunger, [
    { label: "Alimentados", check: (value) => value < 50 },
    { label: "Hambrientos", check: (value) => value <= 80 },
    { label: "Moribundos", check: () => true },
  ]),
});

const getCastleState = () =>
  statusFromValue(state.castle.pressure, [
    { label: "Líneas sólidas", check: (value) => value < 50 },
    { label: "Líneas comprometidas", check: (value) => value <= 80 },
    { label: "Líneas rotas", check: () => true },
  ]);

const updateStat = (group, key, delta) => {
  group[key] = round1(statClamp(group[key] + delta));
};

const updateCastlePressure = (delta) => {
  state.castle.pressure = round1(statClamp(state.castle.pressure + delta));
};

const applyDailyVariation = () => {
  state.groups.forEach((group) => {
    if (group.dead) return;
    updateStat(group, "thirst", 20);
    updateStat(group, "hunger", 10);
    updateStat(group, "loyalty", -1);
  });
  updateCastlePressure(2.5);
  logEntry("Se aplicaron las variaciones base del día.");
};

const applyPassiveEffects = () => {
  state.groups.forEach((group) => {
    if (group.dead) return;
    const states = getGroupStates(group);
    if (states.loyalty === "Descontentos") {
      updateStat(group, "loyalty", -0.5);
    }
    if (states.thirst === "Sedientos") {
      updateStat(group, "loyalty", -0.5);
    }
    if (states.hunger === "Hambrientos") {
      updateStat(group, "loyalty", -0.5);
    }
    if (states.thirst === "Deshidratados") {
      updateStat(group, "population", -10);
    }
    if (states.hunger === "Moribundos") {
      updateStat(group, "population", -10);
    }
  });
  logEntry("Los efectos pasivos afectaron a los grupos activos.");
};

const handleCounters = () => {
  state.groups.forEach((group) => {
    if (group.dead) return;
    const states = getGroupStates(group);
    const counters = group.counters;

    counters.popFinal = states.population === "Crítica" ? counters.popFinal + 1 : 0;
    counters.loyaltyNeg = states.loyalty === "Descontentos" ? counters.loyaltyNeg + 1 : 0;
    counters.loyaltyFinal = states.loyalty === "Descontentos" ? counters.loyaltyFinal + 1 : 0;
    counters.thirstFinal = states.thirst === "Deshidratados" ? counters.thirstFinal + 1 : 0;
    counters.hungerFinal = states.hunger === "Moribundos" ? counters.hungerFinal + 1 : 0;

    if (counters.popFinal === 5) {
      queueEvent(createFinalEvent("Evento final de Población", group));
    }
    if (counters.loyaltyNeg === 10) {
      queueEvent(createLoyaltyNegEvent(group));
    }
    if (counters.loyaltyFinal === 20) {
      queueEvent(createFinalEvent("Evento final de Lealtad", group));
    }
    if (counters.thirstFinal === 2) {
      queueEvent(createFinalEvent("Evento final de Sed", group));
    }
    if (counters.hungerFinal === 2) {
      queueEvent(createFinalEvent("Evento final de Hambre", group));
    }
  });

  state.castle.pressureCounter =
    getCastleState() === "Líneas rotas" ? state.castle.pressureCounter + 1 : 0;

  if (state.castle.pressureCounter === 7) {
    queueEvent({
      title: "Evento final de Presión",
      description:
        "Las defensas ceden. La ciudad cae y los enemigos toman el castillo.",
      options: [
        {
          label: "Aceptar destino",
          action: () => endGame("La ciudad cayó ante la presión enemiga."),
        },
      ],
    });
  }
};

const resolveExpeditions = () => {
  state.groups.forEach((group) => {
    if (!group.onExpedition || group.dead) return;
    if (group.expeditionReturn > state.day) return;

    group.onExpedition = false;
    group.expeditionReturn = null;

    if (group.returnThirst) {
      group.thirst = 75;
      group.returnThirst = false;
    }
    if (group.returnHunger) {
      group.hunger = 75;
      group.returnHunger = false;
    }

    if (Math.random() <= 0.1) {
      group.dead = true;
      logEntry(`La expedición de <strong>${group.name}</strong> desapareció.`);
      return;
    }

    if (Math.random() <= 0.25) {
      updateStat(group, "population", -15);
      logEntry(`La expedición de <strong>${group.name}</strong> vuelve con bajas.`);
    }

    const expeditionPenalty = getCastleState() === "Líneas comprometidas" ? 10 :
      getCastleState() === "Líneas rotas" ? 15 : 0;

    const foodRoll = clampProb(50 - expeditionPenalty) / 100;
    const waterRoll = clampProb(50 - expeditionPenalty) / 100;
    const itemRoll = clampProb(35 - expeditionPenalty) / 100;

    if (Math.random() < foodRoll) {
      const found = randRange(1, 3);
      state.food += found;
      logEntry(`La expedición de <strong>${group.name}</strong> consigue ${found} comida.`);
    }
    if (Math.random() < waterRoll) {
      const found = randRange(1, 4);
      state.water += found;
      logEntry(`La expedición de <strong>${group.name}</strong> consigue ${found} agua.`);
    }
    if (Math.random() < itemRoll) {
      const candidates = ITEMS.filter((item) => !state.inventory.includes(item));
      if (candidates.length) {
        const found = pickRandom(candidates);
        state.inventory.push(found);
        logEntry(`La expedición de <strong>${group.name}</strong> obtiene ${found}.`);
      }
    }
  });
};

const applyDelayedEvents = () => {
  if (state.eventQueue.length) {
    openEvent(state.eventQueue.shift());
  }
};

const dailyEvent = () => {
  const available = [
    eventRumorPeste,
    eventDistribucion,
    eventCerrarBrecha,
    eventSenalesParlamento,
    eventElegirObjeto1,
    eventElegirObjeto2,
    eventSacrificio,
    eventIntercambio,
  ];
  const eventCreator = pickRandom(available);
  openEvent(eventCreator());
};

const applyEventSuccessPenalty = (group, baseChance) => {
  if (!group) return clampProb(baseChance);
  const populationState = getGroupStates(group).population;
  const penalty = populationState === "Diezmada" ? 10 : populationState === "Crítica" ? 15 : 0;
  return clampProb(baseChance - penalty);
};

const giveFood = (group) => {
  if (state.food <= 0) return;
  state.food -= 1;
  updateStat(group, "hunger", -40);
  logEntry(`Se entregó comida a <strong>${group.name}</strong>.`);
  render();
};

const giveWater = (group) => {
  if (state.water <= 0) return;
  state.water -= 1;
  updateStat(group, "thirst", -45);
  logEntry(`Se entregó agua a <strong>${group.name}</strong>.`);
  render();
};

const queueEvent = (event) => {
  state.eventQueue.push(event);
};

const openEvent = (event) => {
  ui.eventTitle.textContent = event.title;
  ui.eventDescription.textContent = event.description;
  ui.eventActions.innerHTML = "";

  event.options.forEach((option) => {
    const button = document.createElement("button");
    button.textContent = option.label;
    if (option.primary) button.classList.add("primary");
    button.addEventListener("click", () => {
      const keepOpen = option.action();
      if (!keepOpen) {
        closeEvent();
      }
      render();
    });
    ui.eventActions.append(button);
  });

  ui.modal.classList.remove("hidden");
  ui.nextDay.disabled = true;
};

const closeEvent = () => {
  ui.modal.classList.add("hidden");
  ui.nextDay.disabled = false;
};

const createFinalEvent = (title, group) => ({
  title,
  description: `${group.name} ha colapsado y se pierde para el resto de la partida.`,
  options: [
    {
      label: "Aceptar",
      action: () => {
        group.dead = true;
        logEntry(`Se perdió el grupo <strong>${group.name}</strong>.`);
        if (state.groups.every((item) => item.dead)) {
          return endGame("Todos los grupos han caído. El señor cruzado queda solo.");
        }
        return false;
      },
    },
  ],
});

const createLoyaltyNegEvent = (group) => ({
  title: "Evento negativo de Lealtad",
  description: `El grupo ${group.name} exige ser escuchado. ¿Hablar con ellos?`,
  options: [
    {
      label: "No hablar",
      action: () => {
        updateStat(group, "loyalty", -5);
        logEntry(`Se ignoró a <strong>${group.name}</strong>.`);
      },
    },
    {
      label: "Hablar",
      primary: true,
      action: () => {
        if (Math.random() < 0.5) {
          updateStat(group, "loyalty", 25);
          logEntry(`El diálogo con <strong>${group.name}</strong> mejora la lealtad.`);
        } else {
          updateStat(group, "loyalty", -15);
          logEntry(`El diálogo con <strong>${group.name}</strong> fracasa.`);
        }
      },
    },
  ],
});

const eventRumorPeste = () => {
  const target = getAvailableGroup("Población Civil");
  return {
    title: "Rumor de peste en un barrio",
    description: "¿Investigar el rumor?",
    options: [
      {
        label: "No",
        action: () => logEntry("El rumor se ignora."),
      },
      {
        label: "Sí",
        primary: true,
        action: () => {
          if (!target) {
            logEntry("No hay grupo disponible para atender el rumor.");
            return;
          }
          const chance = applyEventSuccessPenalty(target, 50);
          if (Math.random() < chance / 100) {
            if (!state.inventory.includes("Medicinas")) {
              state.inventory.push("Medicinas");
              logEntry("Se obtienen Medicinas para el castillo.");
            } else {
              updateStat(target, "population", 10);
              logEntry(`La población de <strong>${target.name}</strong> se recupera.`);
            }
          } else {
            updateStat(target, "population", -10);
            logEntry(`El rumor era cierto y <strong>${target.name}</strong> pierde población.`);
          }
        },
      },
    ],
  };
};

const eventDistribucion = () => ({
  title: "Distribución pública de raciones",
  description: "¿Organizar la distribución?",
  options: [
    {
      label: "No",
      action: () => logEntry("No se realiza distribución pública."),
    },
    {
      label: "Sí",
      primary: true,
      action: () => {
        const roll = Math.random();
        if (roll < 0.33) {
          state.groups.forEach((group) => {
            if (!group.dead) updateStat(group, "loyalty", 10);
          });
          logEntry("La distribución mejora la lealtad de todos.");
        } else if (roll < 0.66) {
          state.groups.forEach((group) => {
            if (!group.dead) updateStat(group, "hunger", 15);
          });
          logEntry("El caos aumenta el hambre de todos.");
        } else {
          logEntry("La distribución no cambia nada.");
        }
      },
    },
  ],
});

const eventCerrarBrecha = () => ({
  title: "Cerrar una brecha con escombros",
  description: "¿Enviar obreros a cubrir la brecha?",
  options: [
    {
      label: "Sí",
      action: () => logEntry("La brecha se cubre sin incidentes."),
    },
    {
      label: "No",
      primary: true,
      action: () => {
        if (Math.random() < 0.5) {
          updateCastlePressure(-10);
          logEntry("La brecha se resolvió por fortuna y baja la presión.");
        } else {
          updateCastlePressure(10);
          logEntry("La brecha empeora y sube la presión.");
        }
      },
    },
  ],
});

const eventSenalesParlamento = () => ({
  title: "Señales de parlamento enemigo",
  description: "¿Responder a las señales enemigas?",
  options: [
    {
      label: "No",
      action: () => {
        logEntry("Se ignoran las señales. Queda pendiente un evento en 4 días.");
        delayEvent(4, createChooseItem3Event);
      },
    },
    {
      label: "Sí",
      primary: true,
      action: () => {
        updateCastlePressure(-5);
        logEntry("Las señales reducen la presión y activan un evento especial en 4 días.");
        delayEvent(4, createChooseCharacterEvent);
      },
    },
  ],
});

const eventElegirObjeto1 = () => ({
  title: "Reforzar portones o improvisar barricadas",
  description: "Elegí un objeto para reforzar la defensa.",
  options: [
    ...createItemOption("Herramientas", 75, {
      onFail: () => updateCastlePressure(10),
    }),
    ...createItemOption("Armas", 25, {
      onFail: () => updateCastlePressure(10),
    }),
    {
      label: "Pasar",
      action: () => logEntry("Se decide no usar objetos."),
    },
  ],
});

const eventElegirObjeto2 = () => ({
  title: "Calmar tensión interna con un gesto",
  description: "Elegí un objeto para apaciguar a todos los grupos.",
  options: [
    ...createItemOption("Oro", 0, {
      onFail: () => applyAllGroups("loyalty", -10),
      bonusSuccess: 15,
    }),
    ...createItemOption("Reliquias", 75, {
      onFail: () => applyAllGroups("loyalty", -10),
      bonusSuccess: 15,
    }),
    ...createItemOption("Contactos", 50, {
      onFail: () => applyAllGroups("loyalty", -10),
      bonusSuccess: 15,
    }),
    {
      label: "Pasar",
      action: () => logEntry("Se decide no intervenir."),
    },
  ],
});

const eventSacrificio = () => ({
  title: "Exigen una prueba de compromiso",
  description: "La Burguesía exige un sacrificio. Elegí un objeto a entregar.",
  options: [
    {
      label: "Reliquias",
      action: () => sacrificeItem("Reliquias"),
    },
    {
      label: "Oro",
      action: () => sacrificeItem("Oro"),
    },
    {
      label: "Pasar",
      action: () => {
        const target = getAvailableGroup("Burguesía");
        if (target) updateStat(target, "loyalty", -15);
        logEntry("Se evita el sacrificio y baja la lealtad de la Burguesía.");
      },
    },
  ],
});

const eventIntercambio = () => {
  const requested = pickRandom(ITEMS);
  return {
    title: "Oferta sin garantías",
    description: `Se solicita ${requested} a cambio de una posible recompensa.`,
    options: [
      {
        label: "Rechazar",
        action: () => logEntry("La oferta se rechaza."),
      },
      {
        label: "Aceptar",
        primary: true,
        action: () => {
          if (!state.inventory.includes(requested)) {
            logEntry("No se posee el objeto solicitado, se rechaza la oferta.");
            return;
          }
          removeItem(requested);
          if (Math.random() < 0.5) {
            if (Math.random() < 0.5) {
              state.water += 2;
              logEntry("La oferta rinde 2 de agua.");
            } else {
              state.food += 2;
              logEntry("La oferta rinde 2 de comida.");
            }
          } else {
            logEntry("La oferta no entrega nada." );
          }
        },
      },
    ],
  };
};

const createChooseItem3Event = () => ({
  title: "Resolver una urgencia puntual",
  description: "Elegí un objeto para ayudar a la Guarnición.",
  options: [
    ...createItemOption("Contactos", 5, {
      onSuccess: () => applyGroupChoice("Guarnición"),
      onFail: () => applyGroupLoyaltyPenalty("Guarnición"),
    }),
    ...createItemOption("Oro", 100, {
      onSuccess: () => applyGroupChoice("Guarnición"),
      onFail: () => applyGroupLoyaltyPenalty("Guarnición"),
      alwaysLose: true,
    }),
    {
      label: "Pasar",
      action: () => logEntry("No se interviene en la urgencia."),
    },
  ],
});

const createChooseCharacterEvent = () => ({
  title: "Evento: Elegir personaje",
  description: "Elegí un grupo para negociar.",
  options: (() => {
    const choices = state.groups
      .filter((group) => !group.dead && !group.onExpedition)
      .map((group) => ({
        label: group.name,
        action: () => resolveChooseCharacter(group),
      }));
    if (choices.length) return choices;
    return [
      {
        label: "Nadie disponible",
        action: () => logEntry("No hay grupos disponibles para negociar."),
      },
    ];
  })(),
});

const resolveChooseCharacter = (group) => {
  const chances = {
    Clero: 65,
    Guarnición: 80,
    Siervos: 90,
    Burguesía: 75,
    "Población Civil": 70,
  };
  const chance = clampProb(chances[group.name] ?? 70) / 100;
  if (Math.random() < chance) {
    const unowned = ITEMS.filter((item) => !state.inventory.includes(item));
    if (unowned.length) {
      if (Math.random() < 0.7) {
        const item = pickRandom(unowned);
        state.inventory.push(item);
        logEntry(`La negociación entrega ${item}.`);
        return;
      }
    }
    if (Math.random() < 0.5) {
      state.water += 2;
      logEntry("La negociación aporta 2 de agua.");
    } else {
      state.food += 2;
      logEntry("La negociación aporta 2 de comida.");
    }
  } else {
    updateStat(group, "loyalty", -20);
    logEntry(`La negociación con <strong>${group.name}</strong> fracasa.`);
  }
};

const createItemOption = (
  item,
  successRate,
  { onSuccess, onFail, bonusSuccess = null, alwaysLose = false },
) => {
  return [
    {
      label: `${item} (${successRate}% éxito)`,
      action: () => {
        if (!state.inventory.includes(item)) {
          logEntry(`No tienes ${item}.`);
          return;
        }
        const loseChance = alwaysLose ? 1 : 0.4;
        if (Math.random() < loseChance) {
          removeItem(item);
          logEntry(`Se perdió ${item} durante la acción.`);
        }
        const success = Math.random() < clampProb(successRate) / 100;
        if (success) {
          if (bonusSuccess) applyAllGroups("loyalty", bonusSuccess);
          if (onSuccess) onSuccess();
          logEntry("La acción tiene éxito.");
        } else {
          if (onFail) onFail();
          logEntry("La acción falla.");
        }
      },
    },
  ];
};

const applyAllGroups = (key, delta) => {
  state.groups.forEach((group) => {
    if (!group.dead) updateStat(group, key, delta);
  });
};

const applyGroupChoice = (name) => {
  const target = getAvailableGroup(name);
  if (!target) return;
  if (Math.random() < 0.5) {
    updateStat(target, "thirst", -30);
    logEntry(`La urgencia reduce la sed de <strong>${target.name}</strong>.`);
  } else {
    updateStat(target, "hunger", -30);
    logEntry(`La urgencia reduce el hambre de <strong>${target.name}</strong>.`);
  }
};

const applyGroupLoyaltyPenalty = (name) => {
  const target = getAvailableGroup(name);
  if (!target) return;
  updateStat(target, "loyalty", -15);
  logEntry(`La urgencia falla y cae la lealtad de <strong>${target.name}</strong>.`);
};

const delayEvent = (days, eventCreator) => {
  const targetDay = state.day + days;
  state.delayedEvents.push({ triggerDay: targetDay, eventCreator });
};

const checkDelayedTriggers = () => {
  const remaining = [];
  state.delayedEvents.forEach((event) => {
    if (event.triggerDay <= state.day) {
      queueEvent(event.eventCreator());
    } else {
      remaining.push(event);
    }
  });
  state.delayedEvents = remaining;
};

const sacrificeItem = (chosen) => {
  const target = getAvailableGroup("Burguesía");
  const other = chosen === "Reliquias" ? "Oro" : "Reliquias";
  if (state.inventory.includes(other)) {
    removeItem(other);
    logEntry(`Se pierde permanentemente ${other}.`);
  }
  if (state.inventory.includes(chosen)) {
    removeItem(chosen);
    logEntry(`Se entrega ${chosen}.`);
  } else if (target) {
    updateStat(target, "loyalty", -15);
    logEntry("No hay objeto disponible y baja la lealtad de la Burguesía.");
  }
};

const removeItem = (item) => {
  state.inventory = state.inventory.filter((entry) => entry !== item);
};

const getAvailableGroup = (name) =>
  state.groups.find((group) => group.name === name && !group.dead && !group.onExpedition);

const expeditionEligible = (group) => {
  if (group.dead || group.onExpedition) return false;
  const states = getGroupStates(group);
  if (states.population === "Crítica") return false;
  return !(states.population === "Diezmada" && states.loyalty === "Descontentos");
};

const offerExpedition = () => {
  const candidates = state.groups.filter(expeditionEligible);
  if (!candidates.length) {
    logEntry("No hay grupos aptos para expediciones.");
    return;
  }
  openEvent({
    title: "Expedición disponible",
    description: "Podés enviar un grupo a explorar (3-5 días fuera).",
    options: [
      ...candidates.map((group) => ({
        label: group.name,
        action: () => sendExpedition(group),
      })),
      {
        label: "No enviar",
        action: () => logEntry("Se decide no enviar expediciones."),
      },
    ],
  });
};

const sendExpedition = (group) => {
  const duration = randRange(3, 5);
  group.onExpedition = true;
  group.expeditionReturn = state.day + duration;
  logEntry(`Se envía a <strong>${group.name}</strong> en expedición por ${duration} días.`);
};

const updateExpeditionStatus = () => {
  state.groups.forEach((group) => {
    if (!group.onExpedition || group.dead) return;
    if (group.thirst >= 80) group.returnThirst = true;
    if (group.hunger >= 80) group.returnHunger = true;
  });
};

const endGame = (message) => {
  openEvent({
    title: "Fin de la partida",
    description: message,
    options: [
      {
        label: "Aceptar",
        action: () => {
          ui.nextDay.disabled = true;
          logEntry("La partida ha terminado.");
        },
      },
    ],
  });
  return true;
};

const advanceDay = () => {
  state.day += 1;
  applyDailyVariation();
  resolveExpeditions();
  handleCounters();
  applyPassiveEffects();
  updateExpeditionStatus();

  checkDelayedTriggers();
  applyDelayedEvents();
  if (!ui.modal.classList.contains("hidden")) {
    render();
    return;
  }

  if (state.day === state.expeditionOfferDay) {
    state.expeditionOfferDay += 2;
    offerExpedition();
    if (!ui.modal.classList.contains("hidden")) {
      render();
      return;
    }
  }

  dailyEvent();
  if (!ui.modal.classList.contains("hidden")) {
    render();
    return;
  }
  render();
};

const render = () => {
  ui.day.textContent = state.day;
  ui.food.textContent = state.food;
  ui.water.textContent = state.water;
  ui.inventory.innerHTML = "";
  state.inventory.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ui.inventory.append(li);
  });

  ui.castle.innerHTML = `
    <div><span>Presión</span><strong>${state.castle.pressure}</strong></div>
    <div><span>Estado</span><strong>${getCastleState()}</strong></div>
  `;

  ui.groups.innerHTML = "";
  state.groups.forEach((group) => {
    const states = getGroupStates(group);
    const card = document.createElement("article");
    card.className = "group";
    card.innerHTML = `
      <div class="group__header">
        <h3>${group.name}</h3>
        <span class="group__status">${group.dead ? "Perdido" : group.onExpedition ? "En expedición" : "Activo"}</span>
      </div>
      <div class="stats">
        <div><span>Población</span><strong>${group.population}</strong><small>${states.population}</small></div>
        <div><span>Lealtad</span><strong>${group.loyalty}</strong><small>${states.loyalty}</small></div>
        <div><span>Sed</span><strong>${group.thirst}</strong><small>${states.thirst}</small></div>
        <div><span>Hambre</span><strong>${group.hunger}</strong><small>${states.hunger}</small></div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "group__actions";
    const foodButton = document.createElement("button");
    foodButton.textContent = "Dar comida";
    foodButton.disabled = group.dead || group.onExpedition || state.food <= 0;
    foodButton.addEventListener("click", () => giveFood(group));

    const waterButton = document.createElement("button");
    waterButton.textContent = "Dar agua";
    waterButton.disabled = group.dead || group.onExpedition || state.water <= 0;
    waterButton.addEventListener("click", () => giveWater(group));

    actions.append(foodButton, waterButton);
    card.append(actions);
    ui.groups.append(card);
  });
};

ui.nextDay.addEventListener("click", () => {
  advanceDay();
});

initGame();
