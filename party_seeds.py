"""Initial client list for RR Foods SARL — seeded on startup (idempotent)."""

from db import DEFAULT_BUSINESS_ID, get_db_connection
from parties import find_or_create_party

DEFAULT_CUSTOMER_NAMES = [
    "ABBO HAMADOU OUSMANOU (TRANSPORTER)",
    "ABDOUL AZIZ",
    "ABDOUL MOMIN",
    "ABDUL REHMAN DOUALA",
    "ABESSO ISSA KOUSSERI",
    "ABOUBAKAR EBEGER ADAM CHAD",
    "ABDOURAMAN DOUALA",
    "ABDULAI GARDUA",
    "ACHILLE DOUALA",
    "ADAM LIMAN",
    "AGENCE DE PRESTATION MARITIMES S.A.",
    "AHMADOU YAYA C/O ELAMIN AFISA",
    "AHMED BLAMA",
    "ALI ABDULAI KARIM",
    "ALI BAKARI",
    "ALI BHAI",
    "ALLIOUM YOUSSOUF MBOPPI",
    "AMINOU HASSANA (TRANSPORTER)",
    "AMINOU NGAOUNDERE",
    "AMINOU YAYA SCB",
    "APM (AGENCE DE PRESTATIONS MARITIMES)",
    "ASOBO AGENT",
    "AZANGUE",
    "BABBA NASSOURU",
    "BOTIO SARL",
    "BRUNNO & MADAM ALICE SALES ACCOUNT",
    "CASH CUSTOMER (DOUALA)",
    "CASH CUSTOMER (GAROUA)",
    "CASH CUSTOMER (TCHAD)",
    "CASH CUSTOMER (YAOUNDE)",
    "DEEPAK DOLPHIN",
    "DJIONGO YOUNDE",
    "ELHAJI BABBA",
    "ELHAJI BACHAIR (TCHAD)",
    "ELHAJI BICHARA",
    "ELHAJI FALAMA (MAMA HAUVA)",
    "ELHAJI FAYCAL",
    "ELHAJI HALIM (TCHAD)",
    "ELHAJI IBRAHIM KOUSSERI",
    "ELHAJI MOCTAR BERTOUA",
    "ELHAJI SADIQ (TCHAD)",
    "ETC TCHARI-KOUROU (TCHAD)",
    "GREEN VALLEY SARL",
    "HAMADOU GAROUA",
    "HAMAN JODA (MAMA HAUVA)",
    "HAMAN ZOURBA GAROUA",
    "HAYATOU NASSOURU (MAROUA)",
    "HAYATOU NASSOURU (SALT ACCOUNT)",
    "HAYATOU NASSOURU (TOUBORO)",
    "IAHMAT / ABDULAHI",
    "IBRAHIM GAROUA",
    "IDRESS DOUALA",
    "JOEL RICE AGENT",
    "JOSY (ADAM ALI)",
    "KHAN SAHAB",
    "LUDOUIC",
    "MADAM AMICCTTE",
    "MADAM BERICE",
    "MADAM HAUVA",
    "MADAM MUNDO",
    "MADAM TENEG",
    "MADAM WALLET / ALICE",
    "MANSOOR KHAN",
    "MOHAMED HADIE",
    "MOI FOOD CAMEROON SARL",
    "MOUSSA YAYA",
    "MR. JEAN (MARCHE BOPPI)",
    "MUHAMMAD HADJI",
    "NAIK MUHAMMAD",
    "NASIRDIN KHALIFA (C/O ELAMIN AFISA) SUGAR BANGUI",
    "NASIRDIN KHALIFA ELAMIN AFISA BANGUI",
    "NASIRDIN KHALIFA ELAMIN AFISA DOUALA",
    "NDOUG MEME OLEMBE",
    "NGALLE GERMAIN",
    "OUMAROU CONGO",
    "OUMAROU DOUALA",
    "OUMAROU SANDA",
    "OUSMAN SALKI",
    "PAL SERVICES SARL",
    "PAUL TSAFACK JEAN (TRUCK DRIVER)",
    "RAPHAELI MBOUSSI DOUALA AGENT",
    "ROUFAI",
    "SAIDOU HAUVA",
    "SAVA COACH",
    "SAVA CUSTOMER MOIZEE BAGS",
    "SHOPING FAMILY",
    "SOCIETE ABOUYOUSRA SARL (SIDIK - YASSIR)",
    "SOCOFARI SARL",
    "SOPAL SARL",
    "SOULEYMANOU MADI DOUALA",
    "SUB CLIENT - HAYATOU NASSOURU",
    "SURAT SHAH",
    "TAMAFFO AGENT DOUALA",
    "TANEGANG TCHINDA LOIC",
    "TRADE VENTURES CHAD LTD SARL",
    "VINCENT YOUNDE",
    "YAYA GAROUA",
]


def seed_default_customers(business_id: int = DEFAULT_BUSINESS_ID) -> int:
    """Insert default customers if missing. Returns count of rows touched."""
    conn = get_db_connection()
    cur = conn.cursor()
    added = 0
    try:
        for name in DEFAULT_CUSTOMER_NAMES:
            before = find_or_create_party(
                cur, name, business_id=business_id, party_type="customer"
            )
            if before:
                added += 1
        conn.commit()
    finally:
        cur.close()
        conn.close()
    return added


if __name__ == "__main__":
    count = seed_default_customers()
    print(f"Seeded {len(DEFAULT_CUSTOMER_NAMES)} default customers ({count} party ids resolved).")
