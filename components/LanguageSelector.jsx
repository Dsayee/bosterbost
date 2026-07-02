"use client";

import { useEffect, useState } from "react";

const languages = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "Francais", dir: "ltr" },
  { code: "sw", label: "Swahili", dir: "ltr" },
  { code: "ar", label: "Arabic", dir: "rtl" },
  { code: "pt", label: "Portugues", dir: "ltr" },
  { code: "es", label: "Espanol", dir: "ltr" },
];

const translations = {
  fr: {
    Language: "Langue",
    Home: "Accueil",
    Services: "Services",
    Pricing: "Tarifs",
    API: "API",
    FAQ: "FAQ",
    Blog: "Blog",
    Contact: "Contact",
    "Sign Up": "Inscription",
    "Log In": "Connexion",
    Dashboard: "Tableau de bord",
    Register: "Inscription",
    Login: "Connexion",
    "View Services": "Voir les services",
    "Total Orders": "Commandes totales",
    "Active Users": "Utilisateurs actifs",
    "Processing Pace": "Vitesse de traitement",
    "Customer portal": "Portail client",
    "Organic growth dashboard": "Tableau de croissance organique",
    Overview: "Apercu",
    Wallet: "Portefeuille",
    Orders: "Commandes",
    Support: "Support",
    "Add funds": "Ajouter des fonds",
    "Recent transactions": "Transactions recentes",
    "Submit campaign request": "Envoyer la demande",
    "Order history": "Historique des commandes",
    "Support messages": "Messages support",
    "Send support request": "Envoyer une demande",
    "Current user": "Utilisateur actuel",
    "Wallet balance": "Solde du portefeuille",
    "My order requests": "Mes commandes",
    "Support tickets": "Tickets support",
    "Total Pending Orders": "Commandes en attente",
    "Total Completed Orders": "Commandes terminees",
    "Total Processing Orders": "Commandes en traitement",
    "Total Cancelled Orders": "Commandes annulees",
    Amount: "Montant",
    Currency: "Devise",
    Module: "Module",
    Service: "Service",
    Quantity: "Quantite",
    Status: "Statut",
    Date: "Date",
    Subject: "Sujet",
    Category: "Categorie",
    Message: "Message",
    Attachment: "Piece jointe",
    Reply: "Reponse",
    Refresh: "Actualiser",
    "Log Out": "Deconnexion",
    "Admin panel": "Portail admin",
    "Orders & users": "Commandes et utilisateurs",
    "Overview": "Apercu",
    "Support Tickets": "Tickets support",
    "Finance Reports": "Rapports financiers",
    "Users & Access": "Utilisateurs et acces",
    "Download Report": "Telecharger le rapport",
    "Income Report": "Rapport des revenus",
    "Expense Report": "Rapport des depenses",
    "Confirm change": "Confirmer",
    Save: "Enregistrer",
    Cancel: "Annuler",
    "View Ticket": "Voir le ticket",
    "Place Order": "Passer commande",
    "Search reports": "Rechercher",
    Period: "Periode",
    Month: "Mois",
    Quarter: "Trimestre",
    Year: "Annee",
    Customer: "Client",
    Email: "Email",
    Type: "Type",
    Description: "Description",
    Name: "Nom",
    Joined: "Inscrit",
    Verified: "Verifie",
    Admin: "Admin",
    Access: "Acces",
  },
  sw: {
    Language: "Lugha",
    Home: "Nyumbani",
    Services: "Huduma",
    Pricing: "Bei",
    Contact: "Wasiliana",
    "Sign Up": "Jisajili",
    "Log In": "Ingia",
    Dashboard: "Dashibodi",
    Register: "Jisajili",
    Login: "Ingia",
    "View Services": "Tazama huduma",
    "Total Orders": "Oda zote",
    "Active Users": "Watumiaji hai",
    "Customer portal": "Portal ya mteja",
    "Organic growth dashboard": "Dashibodi ya ukuaji asilia",
    Overview: "Muhtasari",
    Wallet: "Mkoba",
    Orders: "Oda",
    Support: "Msaada",
    "Add funds": "Ongeza salio",
    "Recent transactions": "Miamala ya karibuni",
    "Submit campaign request": "Tuma ombi",
    "Order history": "Historia ya oda",
    "Support messages": "Ujumbe wa msaada",
    "Send support request": "Tuma ombi la msaada",
    "Wallet balance": "Salio la mkoba",
    "My order requests": "Oda zangu",
    "Support tickets": "Tiketi za msaada",
    Amount: "Kiasi",
    Currency: "Sarafu",
    Quantity: "Kiasi",
    Status: "Hali",
    Date: "Tarehe",
    Subject: "Kichwa",
    Category: "Kategoria",
    Message: "Ujumbe",
    Attachment: "Kiambatisho",
    Reply: "Jibu",
    Refresh: "Sasisha",
    "Log Out": "Toka",
    "Admin panel": "Portal ya admin",
    "Orders & users": "Oda na watumiaji",
    "Finance Reports": "Ripoti za fedha",
    "Users & Access": "Watumiaji na ruhusa",
    "Download Report": "Pakua ripoti",
    "Income Report": "Mapato",
    "Expense Report": "Matumizi",
    "Confirm change": "Thibitisha",
    Save: "Hifadhi",
    Cancel: "Ghairi",
    "View Ticket": "Tazama tiketi",
    "Place Order": "Weka oda",
  },
  es: {
    Language: "Idioma",
    Home: "Inicio",
    Services: "Servicios",
    Pricing: "Precios",
    Contact: "Contacto",
    "Sign Up": "Registrarse",
    "Log In": "Entrar",
    Dashboard: "Panel",
    Register: "Registrarse",
    Login: "Entrar",
    "View Services": "Ver servicios",
    "Customer portal": "Portal de cliente",
    Overview: "Resumen",
    Wallet: "Billetera",
    Orders: "Pedidos",
    Support: "Soporte",
    "Add funds": "Agregar fondos",
    "Download Report": "Descargar reporte",
    Save: "Guardar",
    Cancel: "Cancelar",
  },
  pt: {
    Language: "Idioma",
    Home: "Inicio",
    Services: "Servicos",
    Pricing: "Precos",
    Contact: "Contato",
    "Sign Up": "Cadastrar",
    "Log In": "Entrar",
    Dashboard: "Painel",
    Register: "Cadastrar",
    Login: "Entrar",
    "View Services": "Ver servicos",
    "Customer portal": "Portal do cliente",
    Overview: "Resumo",
    Wallet: "Carteira",
    Orders: "Pedidos",
    Support: "Suporte",
    "Add funds": "Adicionar fundos",
    "Download Report": "Baixar relatorio",
    Save: "Salvar",
    Cancel: "Cancelar",
  },
  ar: {
    Language: "Arabic",
    Home: "Home",
    Services: "Services",
    Pricing: "Pricing",
    Contact: "Contact",
    "Sign Up": "Sign Up",
    "Log In": "Log In",
    Dashboard: "Dashboard",
  },
};

const applyPageTranslations = (language) => {
  const dictionary = translations[language] || {};
  const translate = (value) => dictionary[value] || value;

  document.querySelectorAll("body *").forEach((element) => {
    if (["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(element.tagName)) return;
    if (element.children.length) return;

    const text = element.textContent.trim();
    if (!text) return;
    if (!element.dataset.i18nOriginal) {
      element.dataset.i18nOriginal = text;
    }
    const translated = translate(element.dataset.i18nOriginal);
    if (element.textContent !== translated) {
      element.textContent = translated;
    }
  });

  document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((element) => {
    if (!element.dataset.i18nPlaceholder) {
      element.dataset.i18nPlaceholder = element.getAttribute("placeholder") || "";
    }
    const translated = translate(element.dataset.i18nPlaceholder);
    if (element.getAttribute("placeholder") !== translated) {
      element.setAttribute("placeholder", translated);
    }
  });
};

export default function LanguageSelector() {
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    const savedLanguage = localStorage.getItem("boster-bost-language") || "en";
    setLanguage(savedLanguage);
  }, []);

  useEffect(() => {
    const selected = languages.find((item) => item.code === language) || languages[0];
    document.documentElement.lang = selected.code;
    document.documentElement.dir = selected.dir;
    localStorage.setItem("boster-bost-language", selected.code);
    applyPageTranslations(selected.code);
    window.dispatchEvent(new CustomEvent("boster-language-change", { detail: selected.code }));
    const observer = new MutationObserver(() => applyPageTranslations(selected.code));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  return (
    <label className="language-selector">
      <span>Language</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Change language">
        {languages.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
