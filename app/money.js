// Formatage monetaire partage client/serveur.
//
// La devise n'est jamais codee en dur : elle vient de la boutique du
// marchand (ShopSettings.currencyCode) ou, a defaut, des commandes du drop.
// Le fallback USD ne sert que si aucune devise n'a encore pu etre
// determinee — mieux vaut afficher un montant dans la mauvaise devise que
// planter la page d'analytics.
export const FALLBACK_CURRENCY = "USD";

export function formatMoney(amount, currencyCode, options = {}) {
  const value = Number(amount) || 0;
  const currency = currencyCode || FALLBACK_CURRENCY;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      ...options,
    }).format(value);
  } catch {
    // Intl leve une RangeError sur un code devise qu'il ne connait pas
    // (devise exotique, valeur corrompue en base). On degrade proprement
    // plutot que de casser tout l'affichage.
    return `${value.toLocaleString("en-US", options)} ${currency}`;
  }
}
