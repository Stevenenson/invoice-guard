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


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, s in SAMPLES.items():
        net = sum(c * p for _, _, c, p in s["linii"])
        linii = "".join(LINE.format(i=i, cod=cod, denumire=escape(d), cant=c, pret=p, val=c * p, tva=seed.COTA_TVA)
                        for i, (cod, d, c, p) in enumerate(s["linii"], 1))
        fields = {k: v for k, v in s.items() if k != "linii"}
        xml = TEMPLATE.format(**{**fields, "furnizor": escape(s["furnizor"])}, net=net, total=round(net * (1 + seed.COTA_TVA / 100), 2),
                              client_cui=seed.FIRMA["cui"], client=seed.FIRMA["nume"], linii=linii)
        (OUT / name).write_text(xml, encoding="utf-8")
        print("scris", OUT / name)


if __name__ == "__main__":
    main()
