export const buildings = [
  {
    "code": "HG",
    "name": "Hauptgebäude",
    "campus": "Zentrum",
    "image": "/minigames/eth-blur/HG.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=HG",
    "plan": "/minigames/eth-blur/HG.svg",
    "difficulty": "easy"
  },
  {
    "code": "CAB",
    "name": "Chemie-Altbau",
    "campus": "Zentrum",
    "image": "/minigames/eth-blur/CAB.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=CAB",
    "plan": "",
    "difficulty": "easy"
  },
  {
    "code": "HCI",
    "name": "Chemie",
    "campus": "Hönggerberg",
    "image": "/minigames/eth-blur/HCI.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=HCI",
    "plan": "/minigames/eth-blur/HCI.svg",
    "difficulty": "medium"
  },
  {
    "code": "HIL",
    "name": "Architektur & Bauwissenschaften",
    "campus": "Hönggerberg",
    "image": "/minigames/eth-blur/HIL.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=HIL",
    "plan": "/minigames/eth-blur/HIL.svg",
    "difficulty": "easy"
  },
  {
    "code": "CHN",
    "name": "CHN building",
    "campus": "Zentrum",
    "image": "/minigames/eth-blur/CHN.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=CHN",
    "plan": "/minigames/eth-blur/CHN.svg",
    "difficulty": "medium"
  },
  {
    "code": "LEE",
    "name": "LEE building",
    "campus": "Zentrum",
    "image": "/minigames/eth-blur/LEE.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=LEE",
    "plan": "/minigames/eth-blur/LEE.svg",
    "difficulty": "medium"
  },
  {
    "code": "NO",
    "name": "NO building",
    "campus": "Zentrum",
    "image": "/minigames/eth-blur/NO.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=NO",
    "plan": "/minigames/eth-blur/NO.svg",
    "difficulty": "hard"
  },
  {
    "code": "ETZ",
    "name": "ETZ building",
    "campus": "Zentrum",
    "image": "/minigames/eth-blur/ETZ.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=ETZ",
    "plan": "/minigames/eth-blur/ETZ.svg",
    "difficulty": "hard"
  },
  {
    "code": "CLA",
    "name": "CLA building",
    "campus": "Zentrum",
    "image": "/minigames/eth-blur/CLA.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=CLA",
    "plan": "/minigames/eth-blur/CLA.svg",
    "difficulty": "medium"
  },
  {
    "code": "HPH",
    "name": "HPH building",
    "campus": "Hönggerberg",
    "image": "/minigames/eth-blur/HPH.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=HPH",
    "plan": "/minigames/eth-blur/HPH.svg",
    "difficulty": "medium"
  },
  {
    "code": "HXE",
    "name": "HXE building",
    "campus": "Hönggerberg",
    "image": "/minigames/eth-blur/HXE.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=HXE",
    "plan": "/minigames/eth-blur/HXE.svg",
    "difficulty": "hard"
  },
  {
    "code": "LFW",
    "name": "Land- und Forstwirtschaft",
    "campus": "Zentrum",
    "image": "/minigames/eth-blur/LFW.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=LFW",
    "plan": "",
    "difficulty": "medium"
  },
  {
    "code": "MM",
    "name": "MM building",
    "campus": "Zentrum",
    "image": "/minigames/eth-blur/MM.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=MM",
    "plan": "/minigames/eth-blur/MM.svg",
    "difficulty": "hard"
  },
  {
    "code": "ML",
    "name": "Maschinenlaboratorium",
    "campus": "Zentrum",
    "image": "/minigames/eth-blur/ML.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=ML",
    "plan": "",
    "difficulty": "medium"
  },
  {
    "code": "HWW",
    "name": "HWW · Student housing",
    "campus": "Hönggerberg",
    "image": "/minigames/eth-blur/HWW.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=HWW",
    "plan": "/minigames/eth-blur/HWW.svg",
    "difficulty": "og"
  },
  {
    "code": "HWO",
    "name": "HWO · Student housing",
    "campus": "Hönggerberg",
    "image": "/minigames/eth-blur/HWO.jpg",
    "source": "https://ethz.ch/staffnet/de/service/raeume-gebaeude/orientierung/gebaeude.html?args0=HWO",
    "plan": "",
    "difficulty": "og"
  }
] as const;
export type Building = (typeof buildings)[number];

/** Accepted search/answer aliases; never shown in building labels. */
export const buildingAliases: Partial<Record<Building['code'], readonly string[]>> = {
  HPH: ['Physikgebäude', 'Physics building'],
};
export function matchesBuildingAnswer(building: Building, answer: string) {
  const value = answer.trim().toLocaleLowerCase();
  return [building.code, building.name, ...(buildingAliases[building.code] ?? [])]
    .some(name => name.toLocaleLowerCase() === value);
}
export function matchesBuildingSearch(building: Building, query: string) {
  return [building.code, building.name, building.campus, ...(buildingAliases[building.code] ?? [])]
    .join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
