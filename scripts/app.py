from fastapi import FastAPI, HTTPException, Query
import psycopg2
import json
from datetime import datetime
import pubchempy as pcp
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_CONFIG = {
    'dbname': 'chadappdb',
    'user': 'chaduser',
    'password': 'ala1nna',
    'host': 'localhost',
    'port': 5432,
}

def get_chemical_from_db(name):
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT properties FROM chemicals WHERE name = %s;", (name,))
            result = cur.fetchone()
            if result:
                return result[0]
    return None

def insert_chemical_to_db(name, properties):
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO chemicals (name, properties, created_at, updated_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (name) DO NOTHING;
            """, (name, json.dumps(properties), datetime.now(), datetime.now()))
            conn.commit()

def fetch_chemical_from_pubchem(name):
    try:
        compounds = pcp.get_compounds(name, 'name')
        if not compounds:
            return None
        compound = compounds[0]
        properties = {
            'cid': compound.cid,
            'molecular_formula': compound.molecular_formula,
            'molecular_weight': compound.molecular_weight,
            'canonical_smiles': compound.canonical_smiles,
            'inchi': compound.inchi,
            'inchikey': compound.inchikey,
            'iupac_name': compound.iupac_name,
            'xlogp': compound.xlogp,
            'exact_mass': compound.exact_mass,
            'monoisotopic_mass': compound.monoisotopic_mass,
            'tpsa': compound.tpsa,
            'complexity': compound.complexity,
            'charge': compound.charge,
            'hbond_donor_count': compound.h_bond_donor_count,
            'hbond_acceptor_count': compound.h_bond_acceptor_count,
            'rotatable_bond_count': compound.rotatable_bond_count,
            'heavy_atom_count': compound.heavy_atom_count,
            'isotope_atom_count': compound.isotope_atom_count,
            'atom_stereo_count': compound.atom_stereo_count,
            'defined_atom_stereo_count': compound.defined_atom_stereo_count,
            'undefined_atom_stereo_count': compound.undefined_atom_stereo_count,
            'bond_stereo_count': compound.bond_stereo_count,
            'defined_bond_stereo_count': compound.defined_bond_stereo_count,
            'undefined_bond_stereo_count': compound.undefined_bond_stereo_count,
            'covalent_unit_count': compound.covalent_unit_count,
        }
        return properties
    except Exception:
        return None

@app.get("/chemicals/")
async def chemical_lookup(name: str = Query(..., description="Name of chemical to lookup")):
    chemical = get_chemical_from_db(name)
    if chemical:
        return {"source": "local_db", "data": chemical}

    chemical = fetch_chemical_from_pubchem(name)
    if chemical:
        insert_chemical_to_db(name, chemical)
        return {"source": "pubchem", "data": chemical}

    raise HTTPException(status_code=404, detail=f"Chemical '{name}' not found locally or on PubChem.")
