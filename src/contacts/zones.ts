// Fills in a contact's time zone (George, 2026-11-26): from the city and state first (where they live now),
// then the phone's area code. States split across two zones use a list of cities on the other side of the line.
import type { Zone } from '../rules/types';
import { parseState } from './states';
import { digits10 } from './phones';

/** US area codes by state. A zone after the state means the code sits in that state's other zone;
 *  'mixed' means the code covers both, so it can't decide on its own. */
const CODES: Record<string, string> = {
  AL: '205 251 256 334 659 938', AK: '907', AZ: '480 520 602 623 928', AR: '327 479 501 870',
  CA: '209 213 279 310 323 341 350 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 747 760 805 818 820 831 840 858 909 916 925 949 951',
  CO: '303 719 720 970 983', CT: '203 475 860 959', DE: '302', DC: '202 771',
  FL: '239 305 321 324 352 386 407 561 645 656 689 727 728 754 772 786 813 863 904 941 954 448:mixed 850:mixed',
  GA: '229 404 470 478 678 706 762 770 912 943', HI: '808', ID: '208:mixed 986:mixed',
  IL: '217 224 309 312 331 447 464 618 630 708 730 773 779 815 847 861 872',
  IN: '219:CT 260 317 463 574 765 812:mixed 930:mixed', IA: '319 515 563 641 712', KS: '316 620 785 913',
  KY: '270:CT 364:CT 502 606 859', LA: '225 318 337 504 985', ME: '207', MD: '227 240 301 410 443 667',
  MA: '339 351 413 508 617 774 781 857 978', MI: '231 248 269 313 517 586 616 679 734 810 906 947 989',
  MN: '218 320 507 612 651 763 952', MS: '228 601 662 769', MO: '314 417 557 573 636 660 816 975', MT: '406',
  NE: '308:mixed 402 531', NV: '702 725 775', NH: '603', NJ: '201 551 609 640 732 848 856 862 908 973', NM: '505 575',
  NY: '212 315 329 332 347 363 516 518 585 607 624 631 646 680 716 718 838 845 914 917 929 934',
  NC: '252 336 472 704 743 828 910 919 980 984', ND: '701:mixed',
  OH: '216 220 234 283 326 330 380 419 436 440 513 567 614 740 937', OK: '405 539 572 580 918', OR: '458 503 541 971',
  PA: '215 223 267 272 412 445 484 570 582 610 717 724 814 835 878', RI: '401', SC: '803 821 839 843 854 864', SD: '605:mixed',
  TN: '423:ET 615 629 731 865:ET 901 931',
  TX: '210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 915:MT 936 940 945 956 972 979',
  UT: '385 435 801', VT: '802', VA: '276 434 540 571 686 703 757 804 826 948', WA: '206 253 360 425 509 564',
  WV: '304 681', WI: '262 274 353 414 534 608 715 920', WY: '307',
};
export const AREA: Map<string, { state: string; zone: Zone | 'mixed' }> = new Map();
for (const [st, list] of Object.entries(CODES)) for (const tok of list.split(' ')) {
  const [code, z] = tok.split(':');
  AREA.set(code, { state: st, zone: (z as Zone | 'mixed' | undefined) ?? parseState(st)!.zone });
}

/** Cities on the other side of the line in split states (lower case). Everything else in the state uses its main zone. */
const OTHER_SIDE: Record<string, [Zone, string]> = {
  FL: ['CT', 'pensacola,panama city,panama city beach,fort walton beach,destin,crestview,niceville,navarre,milton,gulf breeze,defuniak springs,marianna,chipley,bonifay,lynn haven,callaway,mary esther,pace,cantonment,freeport,santa rosa beach,valparaiso,graceville,century,jay,molino,vernon,wewahitchka,miramar beach,shalimar,baker,laurel hill,mexico beach,southport,youngstown,fountain,cottondale,sneads,grand ridge,greenwood,malone,alford,ponce de leon,westville,caryville,eglin afb,hurlburt field'],
  TN: ['ET', 'knoxville,chattanooga,johnson city,kingsport,bristol,cleveland,morristown,maryville,alcoa,oak ridge,sevierville,pigeon forge,gatlinburg,greeneville,elizabethton,athens,lenoir city,farragut,powell,clinton,dandridge,jefferson city,newport,rogersville,harriman,kingston,loudon,madisonville,sweetwater,dayton,etowah,ooltewah,hixson,collegedale,signal mountain,soddy daisy,soddy-daisy,east ridge,red bank,seymour,jonesborough,erwin,mountain city,tazewell,lafollette,la follette,jacksboro,rockwood,spring city,corryton,mascot,strawberry plains,church hill,mount carmel,blountville,piney flats,gray,limestone,chuckey,mosheim,bean station,white pine,talbott,new market,kodak,louisville,friendsville,vonore,tellico plains,decatur,benton,ocoee,georgetown,apison,harrison,lookout mountain,lupton city,sale creek,maynardville,rutledge,sneedville,oliver springs,lake city,rocky top,caryville,heiskell,andersonville,norris,philadelphia,greenback,walland,townsend,cosby,parrottsville,del rio,butler,hampton,roan mountain,unicoi,telford,fall branch,surgoinsville,mooresburg,russellville,whitesburg,midway,tellico,niota,riceville,calhoun,charleston,ten mile,graysville,evensville,pikeville,huntsville,oneida,winfield,robbins,helenwood,elgin,mohawk,afton,baileyton,greater chattanooga'],
  KY: ['CT', 'bowling green,owensboro,paducah,hopkinsville,henderson,madisonville,murray,mayfield,glasgow,russellville,princeton,franklin,morganfield,central city,greenville,leitchfield,calvert city,benton,fort campbell,oak grove,scottsville,tompkinsville,burkesville,columbia,cadiz,elkton,dawson springs,providence,sturgis,marion,eddyville,kuttawa,fulton,hickman,clinton,bardwell,wickliffe,la center,smithland,salem,morgantown,brownsville,munfordville,horse cave,cave city,edmonton,hartford,beaver dam,owensboro,hawesville,lewisport,calhoun,livermore,sebree,dixon,clay,slaughters,nortonville,earlington,mortons gap,drakesboro,greenville,powderly,bremen,auburn,adairville,lewisburg,guthrie,trenton,pembroke,crofton,hanson,nebo,white plains,wingo,hardin,dexter,almo,hazel,kirksey,lynn grove,farmington,symsonia,boaz,west paducah,reidland,hardin'],
  IN: ['CT', 'gary,hammond,merrillville,crown point,valparaiso,portage,chesterton,east chicago,highland,munster,schererville,hobart,lake station,michigan city,la porte,laporte,evansville,newburgh,boonville,mount vernon,princeton,tell city,rockport,cedar lake,lowell,dyer,st. john,saint john,griffith,whiting,rensselaer,knox,demotte,winfield,hebron,kouts,wheatfield,north judson,san pierre,westville,wanatah,kingsbury,union mills,haubstadt,fort branch,owensville,poseyville,new harmony,cynthiana,chandler,elberfeld,lynnville,tennyson,grandview,dale,santa claus,cannelton,troy,lake village,morocco,kentland,goodland,brook,remington,wolcott,fowler'],
  MI: ['CT', 'iron mountain,menominee,ironwood,kingsford,iron river,bessemer,wakefield,norway,crystal falls,stephenson,daggett,powers,vulcan,quinnesec,watersmeet'],
  TX: ['MT', 'el paso,horizon city,socorro,anthony,canutillo,van horn,clint,fabens,sierra blanca,san elizario,vinton,tornillo,dell city'],
  ND: ['MT', 'dickinson,bowman,beach,hettinger,mott,new england,belfield,medora,killdeer,halliday,glen ullin,hebron,richardton,taylor,south heart,scranton,regent,elgin,carson,new leipzig,marmarth,rhame,golva,sentinel butte,amidon'],
  SD: ['MT', 'rapid city,spearfish,sturgis,box elder,belle fourche,hot springs,custer,lead,deadwood,hill city,keystone,whitewood,piedmont,black hawk,summerset,new underwood,wall,philip,kadoka,martin,pine ridge,edgemont,buffalo,lemmon,bison,faith,dupree,eagle butte,newell,nisland,ellsworth afb'],
  NE: ['MT', 'scottsbluff,gering,sidney,alliance,chadron,ogallala,kimball,chappell,mitchell,bridgeport,terrytown,morrill,minatare,bayard,crawford,hay springs,rushville,gordon,oshkosh,lewellen,hemingford,harrison,potter,dalton,lodgepole,big springs,grant,imperial'],
  KS: ['MT', 'goodland,sharon springs,tribune,syracuse,kanorado,weskan,coolidge'],
  ID: ['PT', "coeur d'alene,coeur d alene,lewiston,moscow,post falls,sandpoint,hayden,rathdrum,grangeville,orofino,bonners ferry,kellogg,st. maries,saint maries,priest river,spirit lake,athol,hayden lake,dalton gardens,wallace,pinehurst,smelterville,osburn,mullan,plummer,worley,potlatch,troy,kendrick,genesee,juliaetta,kamiah,kooskia,cottonwood,craigmont,nezperce,riggins,white bird,clark fork,ponderay,sagle,blanchard,oldtown,naples,moyie springs,eastport"],
  OR: ['MT', 'ontario,nyssa,vale,adrian,jordan valley,juntura'],
};
const CITY = new Map(Object.entries(OTHER_SIDE).map(([st, [z, list]]) => [st, { zone: z, cities: new Set(list.split(',')) }]));
const cityKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^greater /, '').replace(/ (metropolitan |metro )?area$/, '')
  .replace(/ metro$/, '').replace(/^saint /, 'st. ').replace(/^st /, 'st. ');
/** LinkedIn sometimes gives a region, not a town ("United States", "Tennessee"): no use for the zone line. */
const realCity = (city: string, stateName: string) => { const k = cityKey(city); return k && k !== 'united states' && k !== stateName.toLowerCase() ? k : ''; };

export type ZoneSource = 'city' | 'state' | 'area code' | 'none';
/** The contact's time zone, and what it came from. */
export function zoneFor(c: { city: string; state: string; phone: string; backup: string }): { zone: Zone; by: ZoneSource } {
  const st = parseState(c.state);
  const codes = [c.phone, c.backup].map(p => digits10(p).slice(0, 3)).filter(Boolean).map(a => AREA.get(a)).filter(Boolean) as { state: string; zone: Zone | 'mixed' }[];
  if (st) {
    const split = CITY.get(st.abbr);
    if (!split) return { zone: st.zone, by: 'state' };
    const k = realCity(c.city, st.name);
    if (k) {
      return { zone: split.cities.has(k) || split.cities.has(k.replace(/^st\. /, 'saint ')) ? split.zone : st.zone, by: 'city' };
    }
    // no city: an area code from this state that sits wholly in one zone decides, else the state's main zone
    const local = codes.find(a => a.state === st.abbr && a.zone !== 'mixed');
    return local ? { zone: local.zone as Zone, by: 'area code' } : { zone: st.zone, by: 'state' };
  }
  const a = codes.find(x => x.zone !== 'mixed');
  if (a) return { zone: a.zone as Zone, by: 'area code' };
  const m = codes[0];
  if (m) return { zone: parseState(m.state)!.zone, by: 'area code' };
  return { zone: '', by: 'none' };
}

/** Fills the time zone where it is blank. Contacts that already have one are returned as they are. */
export function withZone<T extends { zone: Zone; city: string; state: string; phone: string; backup: string }>(c: T): T {
  if (c.zone && c.zone !== '?') return c;
  const z = zoneFor(c).zone;
  return z ? { ...c, zone: z } : c;
}
