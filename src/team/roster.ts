// Everyone with a "<Name> Truckers" sheet in George's Drive, from his Truckers Registry sheet (read 2026-11-26, read only).
// Team = the registry's Direct/Greater column; lead = who they are under (registry column N, and George for his
// direct team: Austin, Gracie, Marshall, Dan, Sophia, Aaron). Emails are not kept here: at go-live they come from
// the registry straight into the database. States are the registry's States column (licensed states).
import type { Role } from './agents';

export interface RosterRow { id: string; name: string; team: 'Direct' | 'Greater'; role: Role; lead: string | null; states: string; sheetId: string; note?: string }

export const ROSTER: RosterRow[] = [
  { id: 'george', name: 'George', team: 'Direct', role: 'admin', lead: null, states: 'AL, AR, FL, GA, IA, IN, KY, LA, MD, ME, MI, NC, OH, OK, PA, SC, TN, TX, UT, VA, WV', sheetId: '1zLtdyX5PRkk4KP8GXpsxpHUKzm7HVHOgYUpY3iY4oy0' },
  { id: 'austin', name: 'Austin', team: 'Direct', role: 'agent', lead: 'george', states: 'FL, TX, PA, WV', sheetId: '1UR95sCqdYOU3R-zG8hD_wZGob2Lh6KRFXGv_KhmZ_jE' },
  { id: 'gracie', name: 'Gracie', team: 'Direct', role: 'agent', lead: 'george', states: 'FL, TN, PA, AR, OK, SC, VA', sheetId: '1UkB2CS77d8Rs_3J1_tIZDG0kW17DzXGfWgB6FMP7qIs' },
  { id: 'marshall', name: 'Marshall', team: 'Direct', role: 'agent', lead: 'george', states: 'FL', sheetId: '1fsLX0rBnv9L0m0HP63ncNip8dDXX1f30uASrxtUNloo' },
  { id: 'dan', name: 'Dan', team: 'Direct', role: 'agent', lead: 'george', states: 'TX, MN', sheetId: '1B-Dtwlhrmy_ZxGCgkIBYZBST5I2ZwYFp6tBQfCBiySQ', note: 'Dials with Calilio' },
  { id: 'sophia', name: 'Sophia', team: 'Direct', role: 'agent', lead: 'george', states: 'TN, NC, TX', sheetId: '1NlN0XVGcAo1Ozyi7TRwAA10wDHuUssq7y28tPlDDmW8' },
  // the registry lists Aaron on the Greater team; George put him on his direct team (2026-11-26, asked to confirm)
  { id: 'aaron', name: 'Aaron', team: 'Direct', role: 'agent', lead: 'george', states: 'TN, TX, PA, WV', sheetId: '1V6XZ_4IyFDYRwjpK9_edcRXc85mh_jSRnqcDHRuV6Yk' },
  { id: 'braga', name: 'Braga', team: 'Greater', role: 'lead', lead: null, states: 'AL, CO, FL, GA, IA, IL, IN, LA, MD, ME, NC, NH, NJ, OH, OR, PA, RI, SC, TN, TX, VA, WV, MI', sheetId: '1ng0hQE8fcf1ZfaD4nwvJlpB7s6TxCPNxcvBaSO7kDMc' },
  { id: 'ayden', name: 'Ayden', team: 'Greater', role: 'agent', lead: 'braga', states: 'FL, ME, NC, OH, PA, RI, TN, WV', sheetId: '1lg4A2NU3rvvmYmP5KS8xpUuzMyja95wJxTcq3c-fcqE' },
  { id: 'carlos', name: 'Carlos', team: 'Greater', role: 'agent', lead: 'braga', states: 'TX, FL, PA, TN, MI', sheetId: '15DqxO83R2tMowCRXs4R9gP1ehLPWGVb_0KnVq7ovxaU' },
  { id: 'anum', name: 'Anum', team: 'Greater', role: 'agent', lead: 'braga', states: 'TX, PA, WV, RI', sheetId: '1wGJdeIGRqWHYJ3vSX9e9zvKud_xt_wNqlU-g1-yRVOk' },
  { id: 'bradley', name: 'Bradley', team: 'Greater', role: 'lead', lead: null, states: 'AZ, CO, FL, IA, IN, MD, MI, NC, OH, PA, SC, TN, TX, VA, WV', sheetId: '1ueO3EgZgMKhDvjlhHBV2Rrtxa3auV04xYqE0kJ3SrxA' },
  { id: 'harvey', name: 'Harvey', team: 'Greater', role: 'agent', lead: 'bradley', states: 'FL, PA', sheetId: '1z3VOmMGuB2N98KKZS7QpNtPQfF1sfPx9YAU-uLPqjPQ' },
  { id: 'seth', name: 'Seth', team: 'Greater', role: 'agent', lead: null, states: 'TX, OK, SC, WV, PA, AR', sheetId: '15NTwWWfuR3iDuktGs4lO4qpiSr2YzEecAOR-urG7yR8' },
  { id: 'general', name: 'General', team: 'Greater', role: 'agent', lead: null, states: 'AL, AR, FL, GA, IA, IN, KY, LA, MD, ME, MI, NC, OH, OK, PA, SC, TN, TX, UT, VA, WV', sheetId: '115rQr-LLt95P8tsYkYaMHjUXzRDb2zonK1k0fEu3JzI' },
  { id: 'lorenzo', name: 'Lorenzo', team: 'Greater', role: 'agent', lead: null, states: 'AL, CA, CO, FL, IA, MD, NC, NV, OH, PA, SC, TN, TX, VA, WV', sheetId: '1mp3D5Q3YRBdxZY0ozm3kNVWnbngkuC1XyUIG0SymtfA' },
  { id: 'courtney', name: 'Courtney', team: 'Greater', role: 'agent', lead: null, states: 'TX', sheetId: '117NXKQZGk-PbG9UReNVAHdKFiwkpm-V-k2pbHM6u-V4' },
  { id: 'shawn', name: 'Shawn', team: 'Greater', role: 'agent', lead: null, states: 'TX', sheetId: '18nBpt8dh5KYtE63hoqJGBVAXR6FT-F6DUqsHrpouYpA' },
  { id: 'ivan', name: 'Ivan', team: 'Greater', role: 'agent', lead: null, states: 'FL', sheetId: '1RkpCSjMfCMM3OUlksto52HWmnlQY59ZYF753PDzqmH4' },
  // sheet made but not shared yet: the registry's email for Cameron does not exist
  { id: 'cameron', name: 'Cameron', team: 'Greater', role: 'agent', lead: null, states: 'PA, OH, WV, TN, ME', sheetId: '1yrzFK35ZxRIG8zGiA8DApA-iLTbnlJPyejonwftbADo', note: 'Not signed up yet' },
];
