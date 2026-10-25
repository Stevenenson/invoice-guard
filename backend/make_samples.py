"""Generează facturi e-Factura (UBL) de test în samples/. Rulare: python -m backend.make_samples"""
from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from . import seed

OUT = Path(__file__).resolve().parent.parent / "samples"

TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ID>{nr}</cbc:ID>
  <cbc:IssueDate>{data}</cbc:IssueDate>
  <cbc:DueDate>{scadenta}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyTaxScheme><cbc:CompanyID>RO{cui}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>{furnizor}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyTaxScheme><cbc:CompanyID>RO{client_cui}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>{client}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans><cbc:PaymentMeansCode>31</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount><cbc:ID>{iban}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="RON">{net:.2f}</cbc:TaxExclusiveAmount>
    <cbc:PayableAmount currencyID="RON">{total:.2f}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
{linii}</Invoice>
"""

LINE = """  <cac:InvoiceLine>
    <cbc:ID>{i}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">{cant}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RON">{val:.2f}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>{denumire}</cbc:Name>
      <cac:SellersItemIdentification><cbc:ID>{cod}</cbc:ID></cac:SellersItemIdentification>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>{tva}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="RON">{pret}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
"""

SAMPLES = {
    "factura-ok-digi.xml": {
        "nr": "DG-89001", "data": "2026-10-23", "scadenta": "2026-11-05", "cui": "5888716", "furnizor": "DIGI ROMANIA S.A.",
        "iban": seed.CONTRACTE["5888716"]["iban"],
        "linii": [("INT-500", "Abonament internet 500 Mbps – nov. 2026", 1, 372)],
    },
    "factura-frauda-dante.xml": {
        "nr": "DI-2026-0599", "data": "2026-10-23", "scadenta": "2026-10-28", "cui": "59880002", "furnizor": "DANTE INTERNATIONAL S.R.L.",
        "iban": seed.iban("LV", "HABA", "0551043519501"),
        "linii": [("LAP-15", 'Laptop 15" i7 / 32GB', 8, 3300), ("MON-27", 'Monitor 27"', 8, 780)],
    },
    # Frauda C: firmă fictivă cu nume asemănător, factură trimisă corect prin SPV.
    "factura-frauda-c-dedeman-distributie.xml": {
        "nr": "DD-2026-0107", "data": "2026-10-22", "scadenta": "2026-10-29", "cui": "59880010", "furnizor": "DEDEMAN DISTRIBUTIE SRL",
        "iban": seed.iban("RO", "BTRL", "RONCRT0059880010"),
        "linii": [("VOP-15L", "Vopsea lavabilă albă 15 L", 30, 92)],
    },
}


C = seed.CONTRACTE
DIGI, ORANGE, DANTE, DEDEMAN, ELECTRICA, ALTEX = "5888716", "9010105", "14399840", "2816464", "28909028", "2864518"


def _t(nr, cui, furnizor, iban, linii, data="2026-10-23", scadenta="2026-11-06"):
    return {"nr": nr, "data": data, "scadenta": scadenta, "cui": cui, "furnizor": furnizor, "iban": iban, "linii": linii}


# 15 facturi de test: numele fișierului spune rezultatul așteptat (verde = Plătește, rosu = Blochează, galben = Verifică).
TESTE = {
    # --- verzi: totul se potrivește ---
    "verde-01-digi-internet.xml": _t("DG-90101", DIGI, "DIGI ROMANIA S.A.", C[DIGI]["iban"],
                                     [("INT-500", "Abonament internet 500 Mbps – nov. 2026", 1, 372)]),
    "verde-02-orange-abonamente.xml": _t("ORN-7790001", ORANGE, "ORANGE ROMANIA SA", C[ORANGE]["iban"],
                                         [("ABO-BIZ", "Abonament mobil business – nov. 2026", 25, 40)]),
    "verde-03-electrica-energie.xml": _t("EF-2026-11-801", ELECTRICA, "ELECTRICA FURNIZARE SA", C[ELECTRICA]["iban"],
                                         [("EN-KWH", "Energie electrică – oct. 2026", 2300, 0.92)]),
    "verde-04-emag-monitoare.xml": _t("DI-10301", DANTE, "DANTE INTERNATIONAL SA", C[DANTE]["iban"],
                                      [("MON-27", 'Monitor 27"', 3, 780)]),
    "verde-05-dedeman-materiale.xml": _t("DED-1240", DEDEMAN, "DEDEMAN SRL", C[DEDEMAN]["iban"],
                                         [("VOP-15L", "Vopsea lavabilă albă 15 L", 10, 95), ("BORM-18V", "Mașină de înșurubat 18V", 2, 310)]),
    # --- roșii: blocate ---
    "rosu-06-digi-pe-email-nu-e-in-spv.xml": _t("DG-90777", DIGI, "DIGI ROMANIA S.A.", C[DIGI]["iban"],
                                                [("INT-500", "Abonament internet 500 Mbps – nov. 2026", 1, 372)]),
    "rosu-07-orange-iban-schimbat.xml": _t("ORN-7790002", ORANGE, "ORANGE ROMANIA SA", seed.iban("RO", "BTRL", "RONCRT0077700002"),
                                           [("ABO-BIZ", "Abonament mobil business – nov. 2026", 25, 40)]),
    "rosu-08-dedeman-dublura-platita-in-august.xml": _t("DED-1170", DEDEMAN, "DEDEMAN SRL", C[DEDEMAN]["iban"],
                                                        [("VOP-15L", "Vopsea lavabilă albă 15 L", 32, 95)], data="2026-08-14", scadenta="2026-08-28"),
    "rosu-09-electrica-falsa-cui-invalid.xml": _t("EF-2026-11-990", "28909029", "ELECTRICA FURNIZARE S.R.L.", seed.iban("RO", "BTRL", "RONCRT0028909029"),
                                                  [("EN-KWH", "Energie electrică – oct. 2026", 6000, 0.92)], scadenta="2026-10-28"),
    "rosu-10-nume-petrom-cu-cui-altex.xml": _t("PTR-7001", ALTEX, "OMV PETROM SA", C["1590082"]["iban"],
                                               [("MOTORINA", "Motorină (card flotă) – nov. 2026", 500, 6.00)]),
    # --- galbene: de verificat manual ---
    "galben-11-digi-pret-peste-contract.xml": _t("DG-90102", DIGI, "DIGI ROMANIA S.A.", C[DIGI]["iban"],
                                                 [("INT-500", "Abonament internet 500 Mbps – nov. 2026", 1, 399)]),
    "galben-12-electrica-suma-de-3-ori-media.xml": _t("EF-2026-11-802", ELECTRICA, "ELECTRICA FURNIZARE SA", C[ELECTRICA]["iban"],
                                                      [("EN-KWH", "Energie electrică – oct. 2026", 8000, 0.92)]),
    "galben-13-altex-furnizor-nou-fara-contract.xml": _t("ALX-2026-60010", ALTEX, "ALTEX ROMANIA SRL", seed.iban("RO", "BTRL", "RONCRT0028645180"),
                                                         [("FRIG-260", "Frigider 260 L", 1, 1899)]),
    "verde-14-emag-fara-aviz.xml": _t("DI-10302", DANTE, "DANTE INTERNATIONAL SA", C[DANTE]["iban"],
                                       [("MON-27", 'Monitor 27"', 2, 780)]),
    "galben-15-dedeman-articol-care-nu-e-in-contract.xml": _t("DED-1241", DEDEMAN, "DEDEMAN SRL", C[DEDEMAN]["iban"],
                                                              [("SCARA-5T", "Scară aluminiu 5 trepte", 1, 250)]),
}


def _write(folder: Path, name: str, s: dict) -> None:
    net = sum(c * p for _, _, c, p in s["linii"])
    linii = "".join(LINE.format(i=i, cod=cod, denumire=escape(d), cant=c, pret=p, val=c * p, tva=seed.COTA_TVA)
                    for i, (cod, d, c, p) in enumerate(s["linii"], 1))
    fields = {k: v for k, v in s.items() if k != "linii"}
    xml = TEMPLATE.format(**{**fields, "furnizor": escape(s["furnizor"])}, net=net, total=round(net * (1 + seed.COTA_TVA / 100), 2),
                          client_cui=seed.FIRMA["cui"], client=seed.FIRMA["nume"], linii=linii)
    (folder / name).write_text(xml, encoding="utf-8")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    (OUT / "teste").mkdir(exist_ok=True)
    for name, s in TESTE.items():
        _write(OUT / "teste", name, s)
    print(f"scrise {len(TESTE)} facturi de test în", OUT / "teste")
    for name, s in SAMPLES.items():
        _write(OUT, name, s)
        print("scris", OUT / name)


if __name__ == "__main__":
    main()
