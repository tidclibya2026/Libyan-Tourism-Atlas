export const CONFIG = Object.freeze({
  dataUrl: "data/atlasnatrual.geojson",
  attractionsUrl: "data/attractions.json",

  initialView: {
    lat: 27.5,
    lng: 17.2,
    zoom: 6
  },

  maxResultCards: 160,

  categoryColors: [
    "#0B4F8A",
    "#0AA7C8",
    "#138A6B",
    "#C79A3A",
    "#7A5195",
    "#EF7B45",
    "#2F4858",
    "#1B998B",
    "#D1495B",
    "#30638E",
    "#F6AE2D",
    "#33658A"
  ],

  quickSearches: [
    "بحيرة",
    "عين",
    "وادي",
    "سد",
    "حمامات",
    "محمية"
  ],

  layerGroups: [
    {
      id: "water",
      title: "الموارد المائية",
      icon: "💧",
      categories: [
        "العيون الطبيعية",
        "آبار وخزانات ومصادر مياه أخرى",
        "البحيرات الطبيعية والصحراوية",
        "السدود",
        "البرك والبلطات والقلتات"
      ]
    },
    {
      id: "valleys",
      title: "الأودية والمجاري الطبيعية",
      icon: "≋",
      categories: [
        "الأودية ومصباتها"
      ]
    },
    {
      id: "wellness",
      title: "السياحة الاستشفائية",
      icon: "♨",
      categories: [
        "الفوارات والمياه الكبريتية والحمامات"
      ]
    },
    {
      id: "wetlands",
      title: "الأراضي الرطبة والبيئات الحساسة",
      icon: "🕊",
      categories: [
        "السبخات والأراضي الرطبة",
        "محميات وموائل الطيور المهاجرة"
      ]
    }
  ]
});
