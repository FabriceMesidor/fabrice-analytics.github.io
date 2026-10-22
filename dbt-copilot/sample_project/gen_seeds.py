"""Generate deterministic synthetic raw data for the Harbor Lease sample project.
All names and records are fictional."""
import csv, random, datetime as dt
random.seed(42)
D = dt.date
def w(name, header, rows):
    with open(f"seeds/raw_{name}.csv", "w", newline="") as f:
        cw = csv.writer(f); cw.writerow(header); cw.writerows(rows)

cities = [("Brooklyn","NY"),("Queens","NY"),("Jersey City","NJ"),("Newark","NJ"),("Philadelphia","PA"),("Stamford","CT")]
ptypes = ["garden","mid-rise","high-rise","townhome"]
props = []
for i in range(1, 13):
    c, s = cities[(i-1) % len(cities)]
    props.append([f"P{i:03d}", f"Harbor {['Point','Commons','Yards','Terrace','Landing','Row'][i%6]} {i}", c, s, ptypes[i%4], D(2018+i%6, 1+i%12, 1).isoformat()])
w("properties", ["property_id","property_name","city","state","property_type","acquired_at"], props)

units = []; uid = 0
for p in props:
    for n in range(random.randint(14, 26)):
        uid += 1; beds = random.choice([0,1,1,2,2,3])
        units.append([f"U{uid:04d}", p[0], f"{100+n}", beds, 1500 + beds*550 + random.randint(-150,250)])
w("units", ["unit_id","property_id","unit_number","bedrooms","market_rent"], units)

first = ["Ana","Ben","Chloe","Dev","Elena","Femi","Grace","Hugo","Iris","Jon","Kemi","Luis","Maya","Nia","Omar","Pia","Quinn","Raj","Sara","Tom"]
last = ["Adams","Baptiste","Chen","Diaz","Evans","Fofana","Garcia","Hall","Ito","Joseph","Kim","Lopez","Moreau","Nguyen","Okafor","Patel"]
tenants = []
for i in range(1, 451):
    f, l = random.choice(first), random.choice(last)
    tenants.append([f"T{i:05d}", f, l, f"{f.lower()}.{l.lower()}{i}@example.com", (D(2021,1,1)+dt.timedelta(days=random.randint(0,1700))).isoformat(), random.choice(["A","A","B","B","C","D"])])
w("tenants", ["tenant_id","first_name","last_name","email","created_at","credit_band"], tenants)

apps, leases, pays = [], [], []
aid = lid = pid = 0
occupied = {}
for t in tenants:
    for _ in range(random.choice([1,1,1,2,3])):
        aid += 1; u = random.choice(units)
        sub = D.fromisoformat(t[4]) + dt.timedelta(days=random.randint(0,120))
        if sub > D(2026,9,15): sub = D(2026,9,15) - dt.timedelta(days=random.randint(0,200))
        band = t[5]; p_ok = {"A":.8,"B":.65,"C":.45,"D":.25}[band]
        r = random.random()
        status = "approved" if r < p_ok else ("withdrawn" if r < p_ok+.1 else "declined")
        dec = (sub + dt.timedelta(days=random.randint(1,9))).isoformat() if status != "withdrawn" else ""
        apps.append([f"A{aid:05d}", t[0], u[0], sub.isoformat(), status, dec])
        if status == "approved" and u[0] not in occupied:
            lid += 1; start = (sub + dt.timedelta(days=20)).replace(day=1)
            months = random.choice([12,12,12,18,24]); end = (start + dt.timedelta(days=30*months)).replace(day=1) - dt.timedelta(days=1)
            rent = u[4] + random.randint(-100, 120)
            lstatus = "active" if end >= D(2026,9,30) else random.choice(["expired","expired","renewed"])
            if random.random() < .04: lstatus = "terminated_early"
            leases.append([f"L{lid:05d}", f"A{aid:05d}", t[0], u[0], start.isoformat(), end.isoformat(), rent, lstatus])
            if lstatus == "active": occupied[u[0]] = True
            d = start
            while d <= min(end, D(2026,9,1)):
                pid += 1
                late = random.random() < {"A":.05,"B":.1,"C":.2,"D":.32}[band]
                missed = random.random() < {"A":.005,"B":.01,"C":.03,"D":.07}[band]
                paid = "" if missed else (d + dt.timedelta(days=random.randint(6,40) if late else random.randint(-3,4))).isoformat()
                method = random.choice(["ach","ach","ach","card","check"]) if paid else ""
                if paid and random.random() < .015: method = ""   # data quality issue: unknown method on a paid row
                pays.append([f"PM{pid:06d}", f"L{lid:05d}", d.isoformat(), paid, rent if paid else 0, method])
                d = (d + dt.timedelta(days=32)).replace(day=1)
w("applications", ["application_id","tenant_id","unit_id","submitted_at","status","decided_at"], apps)
w("leases", ["lease_id","application_id","tenant_id","unit_id","start_date","end_date","monthly_rent","status"], leases)
w("payments", ["payment_id","lease_id","due_date","paid_at","amount","payment_method"], pays)

mr = []
cats = ["plumbing","hvac","electrical","appliance","pest","general"]
for i in range(1, 701):
    u = random.choice(units); op = D(2023,1,1) + dt.timedelta(days=random.randint(0, 1360))
    closed = (op + dt.timedelta(days=random.randint(0, 30))).isoformat() if random.random() < .9 else ""
    mr.append([f"MR{i:05d}", u[0], op.isoformat(), closed, random.choice(cats), random.choice(["low","medium","high","urgent"])])
w("maintenance_requests", ["request_id","unit_id","opened_at","closed_at","category","priority"], mr)
print(len(props), len(units), len(tenants), len(apps), len(leases), len(pays), len(mr))
