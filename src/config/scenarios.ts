/**
 * What-If Geopolitical Scenario Simulator — Hardcoded Scenarios
 */

export interface ScenarioEffect {
    type: 'region-highlight' | 'route-disruption' | 'market-impact' | 'military-alert' | 'infrastructure-risk' | 'humanitarian';
    label: string;
    description: string;
    lat: number;
    lon: number;
    radius?: number;
    severity: 'critical' | 'high' | 'moderate' | 'low';
    delayMs: number;
    icon: string;
    affectedLayers?: string[];
}

export interface ScenarioMarketImpact {
    asset: string;
    direction: 'up' | 'down';
    magnitude: string;
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
}

export interface Scenario {
    id: string;
    title: string;
    subtitle: string;
    icon: string;
    category: 'military' | 'cyber' | 'economic' | 'climate' | 'political';
    description: string;
    triggerRegion: { lat: number; lon: number; zoom: number };
    effects: ScenarioEffect[];
    marketImpacts: ScenarioMarketImpact[];
    affectedCountries: string[];
    supplyChainRisks: string[];
    aiPromptContext: string;
}

export const SCENARIOS: Scenario[] = [
    {
        id: 'hormuz-blockade',
        title: 'Strait of Hormuz Blockade',
        subtitle: 'Iran closes the critical oil chokepoint',
        icon: '🚢',
        category: 'military',
        description: 'Iran announces a full naval blockade of the Strait of Hormuz in response to escalating sanctions, deploying fast-attack craft, mines, and anti-ship missiles. 20% of global oil and 25% of LNG transits are immediately disrupted.',
        triggerRegion: { lat: 26.5, lon: 56.2, zoom: 7 },
        effects: [
            { type: 'military-alert', label: 'Iranian Naval Deployment', description: 'IRGC Navy deploys fast-attack boats and mine-laying vessels across the strait', lat: 26.5, lon: 56.2, severity: 'critical', delayMs: 0, icon: '⚓', affectedLayers: ['military', 'waterways'] },
            { type: 'route-disruption', label: 'Oil Tanker Halt', description: 'All tanker traffic through the strait suspended — 20% of global oil supply at risk', lat: 26.0, lon: 56.8, severity: 'critical', delayMs: 1500, icon: '🛢️', affectedLayers: ['waterways'] },
            { type: 'military-alert', label: 'US Carrier Group Deploy', description: 'USS Eisenhower carrier group redirected to Arabian Sea from Mediterranean', lat: 23.0, lon: 62.0, severity: 'high', delayMs: 3000, icon: '🛩️', affectedLayers: ['military'] },
            { type: 'market-impact', label: 'Oil Price Spike', description: 'Brent crude surges past $130/bbl on supply disruption fears', lat: 25.3, lon: 51.5, severity: 'critical', delayMs: 4500, icon: '📈' },
            { type: 'route-disruption', label: 'Cape Route Rerouting', description: 'Tankers reroute via Cape of Good Hope, adding 15-20 days transit time', lat: -34.5, lon: 18.5, severity: 'high', delayMs: 6000, icon: '🗺️' },
            { type: 'region-highlight', label: 'India/China Supply Disruption', description: 'Major Asian importers face 2-3 week supply gap as strategic reserves are tapped', lat: 20.0, lon: 78.0, severity: 'high', delayMs: 7500, icon: '⚠️' },
        ],
        marketImpacts: [
            { asset: 'Brent Crude', direction: 'up', magnitude: '+20-30%', confidence: 'high', rationale: '20% of global oil transits through Hormuz' },
            { asset: 'Gold', direction: 'up', magnitude: '+5-8%', confidence: 'high', rationale: 'Safe-haven demand surge' },
            { asset: 'S&P 500', direction: 'down', magnitude: '-3-5%', confidence: 'high', rationale: 'Risk-off sentiment, energy cost shock' },
            { asset: 'Shipping Stocks', direction: 'up', magnitude: '+15-25%', confidence: 'medium', rationale: 'Tanker rerouting increases ton-mile demand' },
        ],
        affectedCountries: ['IR', 'OM', 'AE', 'SA', 'QA', 'KW', 'BH', 'IN', 'CN', 'JP', 'KR'],
        supplyChainRisks: [
            '20% of global oil supply at immediate risk',
            '25% of global LNG transits disrupted',
            'Asian refinery shutdowns within 2-3 weeks',
            'Global petrochemical supply chain cascade',
        ],
        aiPromptContext: 'The Strait of Hormuz is the world\'s most critical oil chokepoint. A blockade would immediately impact global energy markets and could trigger military confrontation between Iran and the US/Gulf states.',
    },
    {
        id: 'taiwan-crisis',
        title: 'Taiwan Strait Crisis',
        subtitle: 'PLA exercises escalate to blockade',
        icon: '🇹🇼',
        category: 'military',
        description: 'PLA announces "special military exercises" around Taiwan, establishing exclusion zones that effectively blockade the island. TSMC operations disrupted, triggering a global semiconductor shortage.',
        triggerRegion: { lat: 24.5, lon: 118.5, zoom: 6 },
        effects: [
            { type: 'military-alert', label: 'PLA Naval Exercises', description: 'Chinese navy establishes 6 exclusion zones around Taiwan — largest military mobilization since 1996', lat: 24.5, lon: 120.0, severity: 'critical', delayMs: 0, icon: '🚧', affectedLayers: ['military'] },
            { type: 'infrastructure-risk', label: 'TSMC Disruption', description: 'TSMC halts shipments — 60% of global semiconductor foundry output at risk', lat: 24.8, lon: 121.0, severity: 'critical', delayMs: 2000, icon: '🔧' },
            { type: 'military-alert', label: 'US Navy Response', description: 'USS Reagan carrier strike group transits to Philippine Sea', lat: 20.0, lon: 130.0, severity: 'high', delayMs: 3500, icon: '🛩️', affectedLayers: ['military'] },
            { type: 'military-alert', label: 'Japan/Philippines Alert', description: 'Japan raises defense readiness; Philippines increases patrols in South China Sea', lat: 30.0, lon: 135.0, severity: 'high', delayMs: 5000, icon: '⚠️' },
            { type: 'route-disruption', label: 'Shipping Reroutes', description: 'Commercial shipping avoids Taiwan Strait — major Asia-Pacific trade disruption', lat: 22.0, lon: 115.0, severity: 'high', delayMs: 6500, icon: '🚢', affectedLayers: ['waterways'] },
        ],
        marketImpacts: [
            { asset: 'TSMC (TSM)', direction: 'down', magnitude: '-20-30%', confidence: 'high', rationale: 'Direct production disruption risk' },
            { asset: 'Semiconductor ETFs', direction: 'down', magnitude: '-15-20%', confidence: 'high', rationale: 'Global chip supply chain shock' },
            { asset: 'Gold', direction: 'up', magnitude: '+8-12%', confidence: 'high', rationale: 'Geopolitical risk premium surge' },
            { asset: 'VIX', direction: 'up', magnitude: '+50-80%', confidence: 'high', rationale: 'Extreme fear/uncertainty spike' },
        ],
        affectedCountries: ['TW', 'CN', 'JP', 'PH', 'US', 'KR'],
        supplyChainRisks: [
            '60% of global foundry semiconductor output at risk',
            'Global electronics supply chain disruption within weeks',
            'Auto industry production halts (chip shortage)',
            'Apple, Nvidia, AMD supply chain paralysis',
        ],
        aiPromptContext: 'Taiwan produces over 60% of the world\'s semiconductors via TSMC. A Chinese blockade would trigger the most severe supply chain crisis in modern history, with cascading effects across every technology-dependent industry.',
    },
    {
        id: 'russia-nuclear',
        title: 'Russian Nuclear Escalation',
        subtitle: 'Tactical nuclear weapon prepositioning',
        icon: '☢️',
        category: 'military',
        description: 'Russian military rhetoric escalates to confirmed movement of tactical nuclear weapons to forward positions near the Ukrainian border, triggering NATO DEFCON changes and global panic.',
        triggerRegion: { lat: 55.0, lon: 37.0, zoom: 4 },
        effects: [
            { type: 'military-alert', label: 'Nuclear Repositioning', description: 'Satellite imagery confirms tactical nuclear warhead movement to Belarus staging areas', lat: 53.9, lon: 27.6, severity: 'critical', delayMs: 0, icon: '☢️', affectedLayers: ['nuclear', 'military'] },
            { type: 'military-alert', label: 'NATO DEFCON Change', description: 'NATO raises alert level to DEFCON 3 — nuclear forces placed on heightened readiness', lat: 50.8, lon: 4.4, severity: 'critical', delayMs: 2000, icon: '🚨', affectedLayers: ['bases'] },
            { type: 'humanitarian', label: 'Civilian Evacuation', description: 'Poland, Baltics initiate civilian evacuation drills from border regions', lat: 52.2, lon: 21.0, severity: 'high', delayMs: 4000, icon: '🏃' },
            { type: 'region-highlight', label: 'Fallout Modeling', description: 'IAEA publishes nuclear fallout dispersion models for Eastern Europe', lat: 50.4, lon: 30.5, severity: 'critical', delayMs: 5500, icon: '☁️' },
            { type: 'market-impact', label: 'Global Market Panic', description: 'Circuit breakers triggered across major exchanges as panic selling engulfs markets', lat: 40.7, lon: -74.0, severity: 'critical', delayMs: 7000, icon: '📉' },
        ],
        marketImpacts: [
            { asset: 'S&P 500', direction: 'down', magnitude: '-8-15%', confidence: 'high', rationale: 'Existential geopolitical risk' },
            { asset: 'Gold', direction: 'up', magnitude: '+15-25%', confidence: 'high', rationale: 'Ultimate safe haven' },
            { asset: 'VIX', direction: 'up', magnitude: '+50-80%', confidence: 'high', rationale: 'Maximum uncertainty premium' },
            { asset: 'Defense Stocks', direction: 'up', magnitude: '+10-20%', confidence: 'medium', rationale: 'NATO rearmament acceleration' },
        ],
        affectedCountries: ['RU', 'UA', 'PL', 'LT', 'LV', 'EE', 'FI', 'DE', 'BY'],
        supplyChainRisks: [
            'European energy supply from Russia fully cut',
            'Global flight routes avoid Eastern European airspace',
            'Agricultural commodity (wheat, fertilizer) supply shock',
            'Mass population displacement from Eastern Europe',
        ],
        aiPromptContext: 'Nuclear escalation represents the most severe geopolitical scenario. Russian tactical nuclear doctrine includes potential use in conventional conflicts. NATO response protocols would trigger unprecedented global crisis.',
    },
    {
        id: 'india-pakistan',
        title: 'India-Pakistan Escalation',
        subtitle: 'Military mobilization after terror attack',
        icon: '⚔️',
        category: 'military',
        description: 'A major terrorist attack on Indian soil triggers military mobilization on both sides. Cross-border artillery exchanges, airspace closures, and nuclear posturing destabilize South Asia.',
        triggerRegion: { lat: 33.0, lon: 73.0, zoom: 5 },
        effects: [
            { type: 'military-alert', label: 'Military Mobilization', description: 'Indian armed forces mobilize along Line of Control — largest deployment since 2019', lat: 34.0, lon: 74.0, severity: 'critical', delayMs: 0, icon: '⚔️', affectedLayers: ['military', 'bases'] },
            { type: 'military-alert', label: 'Cross-Border Artillery', description: 'Artillery exchanges reported across LoC; civilian casualties on both sides', lat: 33.5, lon: 73.5, severity: 'critical', delayMs: 2000, icon: '💥' },
            { type: 'region-highlight', label: 'Airspace Closure', description: 'Pakistan and India close airspace — hundreds of international flights diverted', lat: 30.0, lon: 69.0, severity: 'high', delayMs: 3500, icon: '✈️' },
            { type: 'military-alert', label: 'Nuclear Posturing', description: 'Both nations activate nuclear command authorities; missiles placed on alert', lat: 28.6, lon: 77.2, severity: 'critical', delayMs: 5000, icon: '☢️', affectedLayers: ['nuclear'] },
            { type: 'humanitarian', label: 'Refugee Flows', description: 'Border populations flee conflict zones; UN agencies activate emergency response', lat: 32.0, lon: 72.0, severity: 'high', delayMs: 6500, icon: '🏃' },
        ],
        marketImpacts: [
            { asset: 'Indian Rupee (INR)', direction: 'down', magnitude: '-3-5%', confidence: 'high', rationale: 'Capital flight from conflict zone' },
            { asset: 'Nifty 50', direction: 'down', magnitude: '-5-8%', confidence: 'high', rationale: 'Indian market selloff' },
            { asset: 'Gold', direction: 'up', magnitude: '+5-8%', confidence: 'high', rationale: 'Nuclear risk premium' },
            { asset: 'Defense Stocks', direction: 'up', magnitude: '+10-15%', confidence: 'medium', rationale: 'Regional rearmament demand' },
        ],
        affectedCountries: ['IN', 'PK', 'AF', 'CN'],
        supplyChainRisks: [
            'IT outsourcing disruption (India is global hub)',
            'Pharmaceutical supply chain impact (India exports)',
            'Textile and garment supply disruption',
            'Regional aviation completely halted',
        ],
        aiPromptContext: 'India and Pakistan are both nuclear-armed states with a history of military confrontation. The Kashmir region remains one of the most militarized zones on Earth. Any escalation carries nuclear risk.',
    },
    {
        id: 'south-china-sea',
        title: 'South China Sea Clash',
        subtitle: 'Naval collision escalates into armed conflict',
        icon: '🛥️',
        category: 'military',
        description: 'A ramming incident between Chinese Coast Guard and Philippine resupply vessels near Second Thomas Shoal results in casualties, triggering the US-Philippines Mutual Defense Treaty.',
        triggerRegion: { lat: 9.7, lon: 115.8, zoom: 6 },
        effects: [
            { type: 'military-alert', label: 'Vessel Collision', description: 'Philippine Coast Guard vessel sunk after ramming by CCG; 4 confirmed casualties', lat: 9.7, lon: 115.8, severity: 'critical', delayMs: 0, icon: '💥', affectedLayers: ['military'] },
            { type: 'military-alert', label: 'MDT Activation Request', description: 'Manila officially requests US military assistance under Article IV of MDT', lat: 14.6, lon: 121.0, severity: 'high', delayMs: 2000, icon: '📜' },
            { type: 'military-alert', label: 'US 7th Fleet Sortie', description: 'US Navy destroyers deploy from Subic Bay to escort Philippine vessels', lat: 14.8, lon: 120.3, severity: 'critical', delayMs: 4000, icon: '🚢', affectedLayers: ['military'] },
            { type: 'route-disruption', label: 'Commercial Traffic Halts', description: 'Insurance premiums spike 400%; tankers avoid disputed waters', lat: 12.0, lon: 114.0, severity: 'high', delayMs: 6000, icon: '🚢', affectedLayers: ['waterways'] },
            { type: 'military-alert', label: 'PLA Air Force Sorties', description: 'Chinese H-6 bombers and J-20 fighters conduct combat patrols over Spratlys', lat: 9.5, lon: 113.0, severity: 'high', delayMs: 8000, icon: '🛩️' },
        ],
        marketImpacts: [
            { asset: 'Shanghai Composite', direction: 'down', magnitude: '-4-6%', confidence: 'high', rationale: 'Fear of US sanctions and conflict' },
            { asset: 'US Defense Primes', direction: 'up', magnitude: '+5-10%', confidence: 'high', rationale: 'Direct US involvement in Pacific theater' },
            { asset: 'Global Freight Rates', direction: 'up', magnitude: '+40-60%', confidence: 'high', rationale: '30% of global maritime trade passes through SCS' },
        ],
        affectedCountries: ['PH', 'CN', 'US', 'VN', 'TW', 'MY'],
        supplyChainRisks: [
            'Rerouting of Asia-Europe maritime trade via Lombok Strait (+3 days)',
            'Disruption to South Korean and Japanese energy imports',
            'Surge in maritime insurance war-risk premiums',
        ],
        aiPromptContext: 'The South China Sea is a critical maritime chokepoint. The US-Philippines Mutual Defense Treaty legally compels US intervention if Philippine armed forces, public vessels, or aircraft are attacked in the South China Sea.',
    },
    {
        id: 'korean-peninsula',
        title: 'Korean Peninsula Escalation',
        subtitle: 'DPRK artillery strike on border island',
        icon: '🚀',
        category: 'military',
        description: 'North Korea conducts a surprise artillery barrage on Yeonpyeong Island followed by the mobilization of conventional forces along the DMZ, prompting South Korean retaliatory strikes.',
        triggerRegion: { lat: 37.6, lon: 125.7, zoom: 6 },
        effects: [
            { type: 'military-alert', label: 'Yeonpyeong Artillery Strike', description: '200+ DPRK artillery shells hit Yeonpyeong Island; civilian and military casualties', lat: 37.6, lon: 125.7, severity: 'critical', delayMs: 0, icon: '💥', affectedLayers: ['military'] },
            { type: 'military-alert', label: 'ROK Retaliation', description: 'South Korean F-35s conduct precision strikes on North Korean coastal batteries', lat: 38.0, lon: 125.5, severity: 'critical', delayMs: 2000, icon: '🛩️' },
            { type: 'region-highlight', label: 'Seoul Alert Level', description: 'Seoul elevated to DEFCON 3; civilians directed to subterranean shelters', lat: 37.5, lon: 126.9, severity: 'high', delayMs: 4000, icon: '🚨' },
            { type: 'military-alert', label: 'USFK Force Posture', description: 'US Forces Korea activates strategic bombers from Anderson AFB (Guam)', lat: 13.5, lon: 144.9, severity: 'high', delayMs: 6000, icon: '🦅', affectedLayers: ['bases'] },
            { type: 'market-impact', label: 'Global Tech Selloff', description: 'Markets panic over potential disruption to South Korean memory chip production', lat: 37.2, lon: 127.0, severity: 'high', delayMs: 8000, icon: '📉' },
        ],
        marketImpacts: [
            { asset: 'Samsung / SK Hynix', direction: 'down', magnitude: '-15-20%', confidence: 'high', rationale: 'Production facilities within DPRK artillery range' },
            { asset: 'Korean Won (KRW)', direction: 'down', magnitude: '-5-8%', confidence: 'high', rationale: 'Immediate capital flight' },
            { asset: 'VIX', direction: 'up', magnitude: '+30-40%', confidence: 'high', rationale: 'Threat of regional nuclear escalation' },
        ],
        affectedCountries: ['KP', 'KR', 'US', 'JP', 'CN'],
        supplyChainRisks: [
            '60%+ of global DRAM memory chip supply at immediate risk',
            'South Korean shipbuilding and automotive exports halted',
            'Commercial aviation completely suspended in East Asia corridor',
        ],
        aiPromptContext: 'Seoul (population 10M+) sits just 35 miles from the DMZ, entirely within range of thousands of DPRK conventional artillery pieces. Escalation immediately threatens the global semiconductor memory supply chain.',
    },
    {
        id: 'suwalki-gap',
        title: 'Suwalki Gap Crisis',
        subtitle: 'Russian ground incursion into NATO territory',
        icon: '🛡️',
        category: 'military',
        description: 'Following unrest in Kaliningrad, Russian and Belarusian mechanized units cross into the Suwalki Gap, attempting to establish a land bridge and cutting off the Baltic states from NATO.',
        triggerRegion: { lat: 54.1, lon: 23.1, zoom: 6 },
        effects: [
            { type: 'military-alert', label: 'Border Incursion', description: 'Russian 11th Army Corps breaches Lithuanian border linking with Belarusian forces', lat: 54.1, lon: 23.1, severity: 'critical', delayMs: 0, icon: '🪖', affectedLayers: ['military'] },
            { type: 'military-alert', label: 'Article 5 Invoked', description: 'Lithuania and Poland invoke NATO Article 5; Very High Readiness Joint Task Force (VJTF) deployed', lat: 50.8, lon: 4.4, severity: 'critical', delayMs: 2500, icon: '📜' },
            { type: 'humanitarian', label: 'Baltic Blockade', description: 'Estonia, Latvia, and Lithuania physically cut off from European ground transport', lat: 56.0, lon: 24.0, severity: 'high', delayMs: 5000, icon: '🚧', affectedLayers: ['waterways'] },
            { type: 'infrastructure-risk', label: 'Kaliningrad Flashpoint', description: 'NATO forces begin blockade of Kaliningrad exclave in retaliation', lat: 54.7, lon: 20.5, severity: 'high', delayMs: 7500, icon: '⚓' },
        ],
        marketImpacts: [
            { asset: 'Euro (EUR)', direction: 'down', magnitude: '-5-7%', confidence: 'high', rationale: 'Direct kinetic war on European soil' },
            { asset: 'European Equities', direction: 'down', magnitude: '-10-15%', confidence: 'high', rationale: 'Systemic risk to the EU project' },
            { asset: 'US Defense Primes', direction: 'up', magnitude: '+10-20%', confidence: 'high', rationale: 'Massive NATO mobilization requirement' },
        ],
        affectedCountries: ['LT', 'PL', 'RU', 'BY', 'LV', 'EE', 'US', 'DE'],
        supplyChainRisks: [
            'Complete cessation of all Europe-Russia/Belarus transit',
            'Baltic sea commercial shipping halts due to naval mining',
            'European defense manufacturing pivot overrides commercial industry',
        ],
        aiPromptContext: 'The Suwalki Gap is a 65km strip connecting Poland to Lithuania. It is NATO\'s most vulnerable geographic chokepoint. Seizing it would connect Russian ally Belarus to the Russian exclave of Kaliningrad, isolating the Baltics.',
    },
    {
        id: 'red-sea-naval',
        title: 'Red Sea Naval Confrontation',
        subtitle: 'Direct kinetic engagement with Houthi forces',
        icon: '🚀',
        category: 'military',
        description: 'A US Navy Arleigh Burke-class destroyer is struck by a coordinated swarm of Houthi anti-ship ballistic missiles and USVs, prompting a massive US/UK retaliatory strike campaign on Yemeni soil.',
        triggerRegion: { lat: 14.5, lon: 42.5, zoom: 6 },
        effects: [
            { type: 'military-alert', label: 'US Warship Struck', description: 'Multiple ASBMs penetrate Aegis defense; USS Carney suffers severe damage in the Red Sea', lat: 14.5, lon: 42.5, severity: 'critical', delayMs: 0, icon: '💥', affectedLayers: ['military'] },
            { type: 'route-disruption', label: 'Bab el-Mandeb Closure', description: 'US CENTCOM declares Red Sea a total exclusion zone; all commercial vessels ordered out', lat: 12.5, lon: 43.3, severity: 'critical', delayMs: 2000, icon: '🚫', affectedLayers: ['waterways'] },
            { type: 'military-alert', label: 'Operation Prosperity Guardian Escalates', description: 'US/UK launch hundreds of Tomahawk missiles at Houthi launch sites and radar installations', lat: 15.3, lon: 44.2, severity: 'critical', delayMs: 4500, icon: '🚀', affectedLayers: ['bases'] },
            { type: 'region-highlight', label: 'Iranian Involvement', description: 'Iranian spy ship MV Behshad targeted by US cyber/electronic warfare', lat: 11.5, lon: 43.0, severity: 'high', delayMs: 6500, icon: '📡' },
        ],
        marketImpacts: [
            { asset: 'Brent Crude', direction: 'up', magnitude: '+8-12%', confidence: 'high', rationale: 'Geopolitical risk premium, fear of Strait of Hormuz contagion' },
            { asset: 'Global Shipping Rates', direction: 'up', magnitude: '+50-100%', confidence: 'high', rationale: 'Total prolonged closure of Suez route' },
            { asset: 'Saudi Equities', direction: 'down', magnitude: '-4-6%', confidence: 'medium', rationale: 'Fear of retaliatory Houthi drone strikes on Saudi oil infrastructure' },
        ],
        affectedCountries: ['YE', 'US', 'GB', 'SA', 'EG', 'IR', 'IL'],
        supplyChainRisks: [
            'Cape route rerouting becomes permanent baseline (adds 2-3 weeks to Asia-EU transit)',
            'European automotive industry faces massive component delays',
            'East African fuel and food supply chain severely degraded',
        ],
        aiPromptContext: 'The Bab el-Mandeb strait is a hyper-critical chokepoint. A successful strike on a US warship would necessitate a massive escalatory response, likely drawing Iran (the Houthi sponsor) closer to direct conflict.',
    }
];
