(function () {
  const state = {
    data: window.AYOR_KNOWLEDGE_BASE_FALLBACK || null,
    source: window.AYOR_KNOWLEDGE_BASE_FALLBACK ? "local-adapter" : "unavailable",
    config: window.AYOR_ASSISTANT_CONFIG || null,
    pendingClarification: null,
    history: []
  };

  const englishLabels = {
    recommendation: "Recommendation",
    why: "Why",
    practicalOptions: "Practical options",
    relevantFacts: "Relevant facts",
    ayorNote: "AYOR Note",
    important: "Important"
  };

  const ukrainianLabels = {
    recommendation: "Рекомендація",
    why: "Чому",
    practicalOptions: "Практичні варіанти",
    relevantFacts: "Важливі факти",
    ayorNote: "AYOR Note",
    important: "Важливо"
  };

  function usesCyrillic(text) {
    return /[А-Яа-яЁёІіЇїЄєҐґ]/.test(text);
  }

  const recommendationPattern = /\b(should i|should we|do i need|do we need|would you recommend|what (?:route|area|island) (?:would you )?recommend|which is better|which island is best|where should (?:i|we) stay|best for (?:me|us)|i(?:'|’| a)?m worried|we(?:'|’)re worried|i am worried|i don(?:'|’)t know what to choose|we don(?:'|’)t know what to choose|help (?:me|us) decide|how many days|is seychelles good in|варто мені|чи потрібн|що (?:ти )?порад|де краще зупин|який острів|допоможи (?:мені )?обрати|я хвилююся|скільки днів)\b/i;
  const factualPattern = /\b(how does|how do i apply|what is|where is|which airlines|eta|currency|airport|ferry schedule|sim card|airalo|як працю|як подати|що таке|де знаход|які авіакомпан|валют|аеропорт|розклад пором|сім-карт)\b/i;
  const recommendationCyrillicPattern = /(чи (?:потрібн|варто)|що (?:ти )?порад|де краще (?:зупин|жити)|який острів|допоможи (?:мені |нам )?(?:обрати|вирішити)|я хвилююся|ми хвилюємося|скільки днів|що краще|найкращ(?:ий|а|е) для (?:мене|нас))/i;
  const factualCyrillicPattern = /(як працю|як подати|що таке|де знаход|які авіакомпан|яка валют|аеропорт|розклад пором|сім-карт|eta)/i;

  function isCyrillic(text) {
    return /[\u0400-\u04ff]/.test(text);
  }

  const broadPlanningPattern = /\b(i want to (?:go|visit|plan)|we want to (?:go|visit|plan)|i(?:'|’)m planning|we(?:'|’)re planning|help me plan|help us plan)\b/i;

  function warmClarificationIntro(query, topicId) {
    const ukrainian = isCyrillic(query);
    const intros = {
      "car-rental": ukrainian
        ? "Це трохи залежить від вашого маршруту на Mahé. Допоможу швидко визначитися:"
        : "That depends a little on how you plan to explore Mahé. I can help you figure it out:",
      "where-to-stay": ukrainian
        ? "Із задоволенням допоможу обрати район. Тут важливі дві речі:"
        : "I'd be happy to help you choose the right area. Two things will make the answer much clearer:",
      "route-security-concern": ukrainian
        ? "Розумію ваше занепокоєння. Допоможу знайти спокійніший і практичний маршрут:"
        : "I understand the concern. I can help you find a calmer, practical route:",
      "weather-seasons": ukrainian
        ? "Цей період може бути хорошим вибором, але все залежить від ваших планів:"
        : "That period can work well, but it depends on the kind of trip you want:",
      "trip-length": ukrainian
        ? "Допоможу визначити комфортну тривалість. Спочатку уточню дві речі:"
        : "I can help you find a comfortable trip length. First, two quick questions:",
      "route-planning": ukrainian
        ? "Допоможу скласти зручний маршрут перельоту. Для початку:"
        : "I can help you work out the most sensible flight route. First:",
      "mahe-start": ukrainian
        ? "Чудовий вибір. Mahé зазвичай є найзручнішим стартом для першої подорожі на Сейшели. Підкажіть:"
        : "Great choice. Mahé is usually the easiest starting point for a first Seychelles trip. Before I suggest an itinerary:",
      default: ukrainian
        ? "Із задоволенням допоможу. Щоб порада справді відповідала вашій подорожі:"
        : "I'd be happy to help. To make the advice fit your trip:"
    };
    return intros[topicId] || intros.default;
  }

  function conversationOpening(query, topicId) {
    const ukrainian = isCyrillic(query);
    if (topicId === "route-security-concern") {
      return ukrainian
        ? "Розумію, чому це викликає занепокоєння."
        : "I understand why that route feels concerning.";
    }
    if (topicId === "where-to-stay" || topicId === "car-rental") {
      return ukrainian
        ? "Добре, давайте підберемо варіант під вашу подорож."
        : "Great, let’s shape this around your trip.";
    }
    return ukrainian
      ? "Звісно. Ось що варто знати."
      : "Of course. Here’s the practical answer.";
  }

  function hasDuration(text) {
    return /\b\d+\s*(?:day|days|night|nights|week|weeks|дн|дні|днів|ноч|тиж)\b/i.test(text);
  }

  function hasMonth(text) {
    return /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|січ|лют|бер|квіт|трав|черв|лип|серп|вер|жовт|лист|груд)\b/i.test(text);
  }

  function hasLocation(text) {
    return /\b(beau vallon|anse royale|eden island|victoria|south mah[eé]|hotel|villa|apartment|бо валлон|анс рояль|віктор|готел|вілл|апартамент)\b/i.test(text);
  }

  function hasOrigin(text) {
    return /\b(from|flying from|departing from|із|з міста|вилітаю з)\s+[a-z\u0400-\u04ff]/i.test(text)
      || /\b(germany|frankfurt|munich|berlin|paris|zurich|london|warsaw|kyiv|kiev|ukraine|poland|німеччин|франкфурт|мюнхен|берлін|париж|цюрих|лондон|варшав|київ|україн|польщ)\b/i.test(text);
  }

  function hasDrivingContext(text) {
    return /\b(rent(?:ing)? (?:a )?car|rental car|with(?:out)? a car|no car|won(?:'|’)t drive|will drive|driving|оренд|авто|машин|без машини|не воджу)\b/i.test(text);
  }

  function hasTripExperience(text) {
    return /\b(first (?:trip|time|visit)|been before|returning|перш(?:а|ий) (?:поїздка|раз)|вже був|вже була)\b/i.test(text);
  }

  function hasPreferenceContext(text) {
    return /\b(beach|swimming|snorkel|hiking|quiet|nightlife|local|luxury|budget|relax|nature|пляж|плаван|сноркл|хайкінг|тихо|місцев|люкс|бюджет|відпоч|природ)\b/i.test(text);
  }

  function clarificationCopy(query, topicId) {
    const ukrainian = isCyrillic(query);
    const copy = {
      "car-rental": {
        intro: ukrainian
          ? "Я можу порадити найкращий варіант, але спочатку потрібні 2 короткі деталі:"
          : "I can recommend the best option, but I need 2 quick details first:",
        questions: [
          { known: hasLocation, en: "Where are you staying?", uk: "Де ви плануєте зупинитися?" },
          { known: hasDuration, en: "How many days will you be on Mahé?", uk: "Скільки днів ви будете на Mahé?" }
        ]
      },
      "where-to-stay": {
        intro: ukrainian
          ? "Я можу порадити найкращий район, але спочатку потрібні 2 короткі деталі:"
          : "I can recommend the best area, but I need 2 quick details first:",
        questions: [
          { known: hasDrivingContext, en: "Will you rent a car?", uk: "Ви плануєте орендувати авто?" },
          { known: hasTripExperience, en: "Is this your first Seychelles trip?", uk: "Це ваша перша поїздка на Сейшели?" }
        ]
      },
      "route-security-concern": {
        intro: ukrainian
          ? "Я допоможу обрати спокійніший маршрут, але спочатку потрібні 2 короткі деталі:"
          : "I can help you choose a calmer route, but I need 2 quick details first:",
        questions: [
          { known: hasOrigin, en: "Which country or city are you flying from?", uk: "З якої країни або міста ви вилітаєте?" },
          { known: hasMonth, en: "What month are you planning to travel?", uk: "На який місяць ви плануєте подорож?" }
        ]
      },
      "weather-seasons": {
        intro: ukrainian
          ? "Я можу сказати, чи цей період підходить саме вам, але потрібна одна деталь:"
          : "I can tell you whether that period suits your trip, but I need one quick detail:",
        questions: [
          { known: hasPreferenceContext, en: "What matters most: calm swimming, snorkeling, hiking, or fewer crowds?", uk: "Що для вас важливіше: спокійне море, снорклінг, хайкінг чи менше людей?" }
        ]
      },
      "trip-length": {
        intro: ukrainian
          ? "Я можу порадити комфортну тривалість, але спочатку потрібні 2 короткі деталі:"
          : "I can recommend a comfortable trip length, but I need 2 quick details first:",
        questions: [
          { known: text => /\b(mah[eé]|praslin|la digue|one island|two islands|three islands|махе|праслін|ла-діг|остр)\b/i.test(text), en: "Which islands are you considering?", uk: "Які острови ви розглядаєте?" },
          { known: hasPreferenceContext, en: "Do you prefer a relaxed pace or seeing as much as possible?", uk: "Ви хочете спокійний темп чи побачити якомога більше?" }
        ]
      },
      "route-planning": {
        intro: ukrainian
          ? "Я можу порадити найкращу логіку перельоту, але спочатку потрібні 2 короткі деталі:"
          : "I can recommend the best flight logic, but I need 2 quick details first:",
        questions: [
          { known: hasOrigin, en: "Which country or city are you flying from?", uk: "З якої країни або міста ви вилітаєте?" },
          { known: hasMonth, en: "What month are you planning to travel?", uk: "На який місяць ви плануєте подорож?" }
        ]
      },
      "mahe-start": {
        intro: "",
        questions: [
          { known: hasDuration, en: "How many days are you planning?", uk: "На скільки днів ви плануєте поїздку?" },
          {
            known: text => /\b(praslin|la digue|other islands|mah[eé] only|праслін|ла-діг|інші острови|лише mah[eé])\b/i.test(text),
            en: "Will you stay only on Mahé or visit other islands too?",
            uk: "Ви залишитеся лише на Mahé чи плануєте інші острови?"
          }
        ]
      },
      default: {
        intro: ukrainian
          ? "Я можу дати точнішу рекомендацію, але спочатку потрібні 2 короткі деталі:"
          : "I can recommend the best option, but I need 2 quick details first:",
        questions: [
          { known: hasDuration, en: "How many days are you planning?", uk: "На скільки днів ви плануєте поїздку?" },
          { known: hasPreferenceContext, en: "What matters most to you on this trip?", uk: "Що для вас найважливіше в цій подорожі?" }
        ]
      }
    };

    const selected = copy[topicId] || copy.default;
    const questions = selected.questions
      .filter(item => !item.known(query))
      .slice(0, 2)
      .map(item => ukrainian ? item.uk : item.en);
    return { intro: warmClarificationIntro(query, topicId), questions };
  }

  function parseModelResult(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  window.AYORKnowledge = {
    async load() {
      try {
        const response = await fetch("knowledge-base.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.data = await response.json();
        state.source = "knowledge-base.json";
      } catch (error) {
        if (!state.data) throw error;
      }
      return state.data;
    },
    getSource() {
      return state.source;
    },
    getConfig() {
      return state.config;
    },
    getHistory() {
      return [...state.history];
    },
    hasPendingClarification() {
      return Boolean(state.pendingClarification);
    },
    detectIntent(query) {
      const explicitDecision = /\b(which is better|which island is best|would you recommend|what would you recommend|where should (?:i|we) stay|best for (?:me|us)|worried|help (?:me|us) decide|should (?:i|we) (?:visit|stay|rent|avoid|choose)|чи варто|що порад|де краще|допоможи (?:мені )?обрати|я хвилююся)\b/i.test(query);
      const cyrillicDecision = recommendationCyrillicPattern.test(query);
      if ((factualPattern.test(query) || factualCyrillicPattern.test(query)) && !explicitDecision && !cyrillicDecision) {
        return "factual";
      }
      return recommendationPattern.test(query) || broadPlanningPattern.test(query) || cyrillicDecision
        ? "recommendation"
        : "factual";
    },
    createClarification(query, topic) {
      let clarificationKey = topic?.id || "default";
      if (/\b(how many days|скільки днів)\b/i.test(query)) clarificationKey = "trip-length";
      if (/\b(what route|which route|route would you recommend|маршрут.{0,20}порад)\b/i.test(query)) clarificationKey = "route-planning";
      if (/(?:go|visit|trip|travel).{0,18}mah[eé]/i.test(query) || /(?:їхати|поїздк|подорож).{0,18}mah[eé]/i.test(query)) {
        clarificationKey = "mahe-start";
      }
      const copy = clarificationCopy(query, clarificationKey);
      if (!copy.questions.length) return null;
      state.pendingClarification = {
        originalQuery: query,
        topicId: topic?.id || null,
        questions: copy.questions
      };
      return {
        id: topic?.id || "clarify",
        label: topic?.label || "Trip planning",
        mode: "clarification",
        clarification: copy,
        currentDataRecommended: false
      };
    },
    detectPrimaryTopic(query) {
      const q = query.toLowerCase();
      if (/де краще (?:зупин|жити)|де зупинитися|який район/.test(q)) {
        return "where-to-stay";
      }
      if (/чи потрібн.{0,18}(?:авто|машин)|чи варто.{0,18}(?:орендувати|брати).{0,12}(?:авто|машин)/.test(q)) {
        return "car-rental";
      }
      if (/хвилююся.{0,30}(?:дуба|іран)|безпечн.{0,20}маршрут|спокійніш.{0,20}маршрут/.test(q)) {
        return "route-security-concern";
      }
      if (/погод|сезон|дощ|вітер|липн|червн|серпн/.test(q)) {
        return "weather-seasons";
      }
      if (/\b(where should (?:i|we) stay|where to stay|best area|де краще зупин|де зупинитися)\b/.test(q)) {
        return "where-to-stay";
      }
      if (/\b(do i need (?:a )?car|should i rent (?:a )?car|чи потрібн.{0,12}(?:авто|машин))\b/.test(q)) {
        return "car-rental";
      }
      const rules = [
        ["route-security-concern", /\b(iran|dubai|war|conflict|worried|anxious|security concern|avoid dubai|safe route|calmer route)\b/],
        ["car-rental", /\b(car rental|rental car|rent (?:a )?car|do i need (?:a )?car|driv(?:e|ing)?|road|parking)\b/],
        ["taxis", /\b(taxi|taxis|cab|uber|bolt)\b/],
        ["transfers", /\b(airport transfer|private transfer|shared shuttle|hotel transfer)\b/],
        ["fruit-markets", /\b(fruit|fruits|market|mango|papaya|banana|passion fruit)\b/],
        ["food", /\b(food|takeaway|restaurant|supermarket|meal|lunch|dinner)\b/],
        ["ferries", /\b(ferry|ferries|cat cocos|cat rose|praslin|la digue|island transfer)\b/],
        ["flights-germany", /\b(germany|german|frankfurt|munich|berlin)\b/],
        ["flights-europe", /\b(flight|flights|fly|airline|airport|paris|zurich)\b/],
        ["eta", /\b(eta|entry|authori[sz]ation|visa|boarding)\b/],
        ["beaches-tides", /\b(tide|tides|low tide|high tide|current|currents)\b/],
        ["beaches-tides", /\b(beach|beaches|snorkeling|snorkelling|swimming)\b/],
        ["weather-seasons", /\b(weather|season|rain|wind|monsoon|temperature)\b/],
        ["budget", /\b(budget|price|prices|cost|costs|money|cash|card|atm|currency)\b/],
        ["where-to-stay", /\b(accommodation|where to stay|hotel|beau vallon|anse royale|eden island|south mah[eé])\b/],
        ["safety", /\b(safety|safe|medical|pharmacy|dangerous|ocean risk|crime|mosquito)\b/],
        ["public-bus", /\b(bus|buses|sptc|public transport)\b/],
        ["mobile-internet", /\b(internet|esim|sim card|mobile data|airalo)\b/]
      ];

      for (const [id, pattern] of rules) {
        if (pattern.test(q)) return id;
      }
      return null;
    },
    search(query) {
      if (!state.data) return null;
      const normalized = query.toLowerCase();
      const primaryId = this.detectPrimaryTopic(query);
      if (primaryId) {
        const primary = state.data.topics.find(topic => topic.id === primaryId);
        if (primary) return primary;
      }
      let best = null;
      let bestScore = 0;

      for (const topic of state.data.topics) {
        let score = 0;
        for (const keyword of topic.keywords) {
          if (normalized.includes(keyword.toLowerCase())) {
            score += keyword.includes(" ") ? 4 : 2;
          }
        }
        if (normalized.includes(topic.category.toLowerCase())) score += 1;
        if (score > bestScore) {
          best = topic;
          bestScore = score;
        }
      }

      return bestScore > 0 ? best : null;
    },
    buildModelRequest(query, topic) {
      const resources = {};
      for (const link of topic?.links || []) {
        resources[link.label] = link.url;
      }

      return {
        system: state.config?.systemPrompt || "",
        user: query,
        responseSchema: state.config?.responseSchema || null,
        context: {
          primaryTopic: topic?.id || null,
          conversationHistory: state.history.slice(-8),
          conversationStage: state.history.length < 2 ? "opening" : "developing",
          publicFacts: topic?.general_facts || [],
          structuredTravelContext: topic?.designer_response || null,
          AYOR_NOTES: topic?.ayor_notes || [],
          officialLinks: resources,
          currentDataRequired: Boolean(topic?.currentDataRecommended),
          webSearchResults: []
        }
      };
    },
    async callModel(query, topic) {
      const adapter = window.AYOR_GPT_API;
      if (!adapter || !state.config) return null;
      const request = this.buildModelRequest(query, topic);
      let raw = null;

      if (typeof adapter.generate === "function") {
        raw = await adapter.generate(request);
      } else if (typeof adapter.complete === "function") {
        raw = await adapter.complete(request);
      } else {
        return null;
      }

      const result = parseModelResult(raw);
      if (!result?.designer_response?.recommendation) return null;
      const allowedNotes = new Set(topic?.ayor_notes || []);
      const verifiedNotes = Array.isArray(result.ayor_notes)
        ? result.ayor_notes.filter(note => allowedNotes.has(note))
        : [];

      return {
        id: result.id || topic?.id || "general-planning",
        label: result.label || topic?.label || "AYOR recommendation",
        opening: result.opening || conversationOpening(query, topic?.id),
        labels: { ...englishLabels, ...(result.labels || {}) },
        designer_response: result.designer_response,
        ayor_notes: verifiedNotes,
        currentDataRecommended: Boolean(result.currentDataRecommended)
      };
    },
    generalFallback(query) {
      if (usesCyrillic(query)) {
        return {
          id: "general-planning",
          label: "Планування подорожі",
          labels: ukrainianLabels,
          designer_response: {
            recommendation: "Я допоможу спроєктувати поїздку, але для персональної рекомендації варто відштовхнутися від ваших дат, тривалості та бажаного ритму.",
            reasoning: "На Сейшелах рішення пов’язані між собою: район проживання визначає потребу в авто, сезон впливає на пляжі й море, а кількість островів — на логістику та бюджет. Без цих деталей можна дати лише базовий напрямок.",
            practical_options: [{
              heading: "Що варто додати",
              items: [
                "Місяць або точні дати подорожі.",
                "Кількість днів і склад подорожуючих.",
                "Які острови ви розглядаєте.",
                "Бажаний бюджет і ставлення до оренди авто."
              ]
            }],
            relevant_facts: [
              "Для першої поїздки часто зручно починати з Mahé.",
              "Краще приймати рішення по одному: переліт, район, транспорт, потім острови й активності."
            ],
            important: "Напишіть ці деталі одним повідомленням, і я запропоную конкретну логіку поїздки, а не загальний список."
          },
          ayor_notes: [],
          currentDataRecommended: false
        };
      }

      return {
        id: "general-planning",
        label: "Trip planning",
        labels: englishLabels,
        designer_response: {
          recommendation: "I can design this with you, but the best recommendation depends on your dates, trip length, and preferred pace.",
          reasoning: "In Seychelles, the decisions are connected: your base affects whether you need a car, the season changes beach conditions, and the number of islands changes both logistics and budget. Without that context, a long list would be less useful than one focused next step.",
          practical_options: [{
            heading: "Add these details",
            items: [
              "Travel month or exact dates.",
              "Number of days and who is travelling.",
              "Which islands you are considering.",
              "Budget range and whether you are comfortable driving."
            ]
          }],
          relevant_facts: [
            "Mahé is the international gateway and often the simplest starting point.",
            "Plan in this order: flights, base area, transport, islands, then activities."
          ],
          important: "Send those details in one message and I will recommend a specific trip logic rather than a generic list."
        },
        ayor_notes: [],
        currentDataRecommended: false
      };
    },
    async answerDirect(query, preferredTopicId) {
      if (!state.data) await this.load();
      const topic = preferredTopicId
        ? state.data.topics.find(item => item.id === preferredTopicId) || this.search(query)
        : this.search(query);

      try {
        const modelAnswer = await this.callModel(query, topic);
        if (modelAnswer) return modelAnswer;
      } catch (error) {
        console.warn("AYOR model adapter failed; using local travel logic.", error);
      }

      if (!topic) return this.generalFallback(query);

      const words = topic.answer.trim().split(/\s+/).length;
      const answer = words < 150 && topic.facts?.length
        ? `${topic.answer}\n\nKey details: ${topic.facts.join(" ")}`
        : topic.answer;

      return {
        ...topic,
        opening: conversationOpening(query, topic.id),
        labels: englishLabels,
        answer
      };
    },
    async answer(query) {
      if (!state.data) await this.load();

      if (state.pendingClarification) {
        const pending = state.pendingClarification;
        state.pendingClarification = null;
        const contextualQuery = `${pending.originalQuery}\n\nTraveler context: ${query}`;
        const result = await this.answerDirect(contextualQuery, pending.topicId);
        state.history.push(
          { role: "user", content: query, contextFor: pending.originalQuery },
          { role: "assistant", mode: "answer", topicId: result.id }
        );
        return result;
      }

      const topic = this.search(query);
      if (this.detectIntent(query) === "recommendation") {
        const clarification = this.createClarification(query, topic);
        if (clarification) {
          state.history.push(
            { role: "user", content: query },
            { role: "assistant", mode: "clarification", questions: clarification.clarification.questions }
          );
          return clarification;
        }
      }

      const result = await this.answerDirect(query, topic?.id);
      state.history.push(
        { role: "user", content: query },
        { role: "assistant", mode: "answer", topicId: result.id }
      );
      return result;
    },
    async answerWithFutureSearch(query) {
      const knowledgeAnswer = await this.answer(query);
      // Future integration point:
      // if no topic is found, or currentDataRecommended is true and live data
      // is requested, call a web-search provider and merge cited current data.
      return knowledgeAnswer;
    }
  };
})();
