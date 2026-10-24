"""Citește o factură e-Factura (UBL 2.1 / CIUS-RO), formatul XML descărcat din SPV."""
from __future__ import annotations

import re

from defusedxml import ElementTree as ET

NS = {
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
}


class InvalidInvoice(ValueError):
    pass


def _num(el, path: str, default: float = 0.0) -> float:
    v = el.findtext(path, namespaces=NS)
    return float(v) if v not in (None, "") else default


def parse(xml: bytes) -> dict:
    try:
        root = ET.fromstring(xml)
    except Exception as e:  # defusedxml ridică mai multe tipuri de excepții
        raise InvalidInvoice(f"XML invalid: {e}") from e
    if not root.tag.endswith("}Invoice"):
        raise InvalidInvoice("Fișierul nu este o factură UBL (lipsește elementul <Invoice>).")

    party = root.find("cac:AccountingSupplierParty/cac:Party", NS)
    if party is None:
        raise InvalidInvoice("Factura nu conține furnizorul (AccountingSupplierParty).")
    name = (party.findtext("cac:PartyLegalEntity/cbc:RegistrationName", namespaces=NS)
            or party.findtext("cac:PartyName/cbc:Name", namespaces=NS) or "")
    cif = (party.findtext("cac:PartyTaxScheme/cbc:CompanyID", namespaces=NS)
           or party.findtext("cac:PartyLegalEntity/cbc:CompanyID", namespaces=NS) or "")

    linii = []
    for line in root.findall("cac:InvoiceLine", NS):
        linii.append({
            "cod": line.findtext("cac:Item/cac:SellersItemIdentification/cbc:ID", namespaces=NS) or "",
            "denumire": line.findtext("cac:Item/cbc:Name", namespaces=NS) or "",
            "cant": _num(line, "cbc:InvoicedQuantity"),
            "pret": _num(line, "cac:Price/cbc:PriceAmount"),
            "tva": _num(line, "cac:Item/cac:ClassifiedTaxCategory/cbc:Percent"),
        })

    return {
        "nr": root.findtext("cbc:ID", namespaces=NS) or "",
        "data": root.findtext("cbc:IssueDate", namespaces=NS) or "",
        "scadenta": root.findtext("cbc:DueDate", namespaces=NS) or "",
        "furnizor": name.strip(),
        "cui": re.sub(r"\D", "", cif),
        "iban": (root.findtext("cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID", namespaces=NS) or "").replace(" ", "") or None,
        "total": _num(root, "cac:LegalMonetaryTotal/cbc:PayableAmount") or None,
        "linii": linii,
        "sursa": "XML încărcat",
    }
