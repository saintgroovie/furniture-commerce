/**
 * Verified CS-Cart buyer paths → current storefront.
 * Only mappings checked against the legacy host page title or article SKU.
 * Unknown product slugs stay unmapped (no homepage dump).
 */

const COLLECTION_HUBS: Record<string, string> = {
  "/kollekcii/greenwich": "/catalog?collection=greenwich",
  "/kollekcii/oliver": "/catalog?collection=oliver",
  "/kollekcii/willie-winkie": "/kids/catalog?collection=willie-winkie",
}

/**
 * Legacy product paths whose CS-Cart article matched exactly one published
 * live variant SKU (2026-09-22 read of 79.133.175.43). 131 listing URLs,
 * 109 with an article, 46 unique live matches. The other 63 articles are
 * not in the current catalog and stay unmapped.
 */
const PRODUCT_REDIRECTS: Record<string, string> = {
  "/kollekcii/kompleksy/dvuhyarusnaya-krovat-so-stolom-i-dvumya-spalnymi-mestami-oxford": "/product/prod_01KQCSHV3ZJ5SB2ZYV4P6SJ2QR",
  "/kollekcii/oliver/banketka-bolshaya-oliver": "/product/prod_01KNTBXADSBJMRQ63HAENWJ880",
  "/kollekcii/oliver/banketka-oliver": "/product/prod_01KNTBXADSNY1JKR33SC2FRJX5",
  "/kollekcii/oliver/chasy-oliver": "/product/prod_01KNTBXADP6726CTE85A445K6N",
  "/kollekcii/oliver/divan-bolshoy-oliver": "/product/prod_01KNTBXADVKWH122FJREKPT5GD",
  "/kollekcii/oliver/divan-oliver": "/product/prod_01KNTBXADVZVCXPHMZ1K8VZAJS",
  "/kollekcii/oliver/etazherka-bolshaya-s-shestyu-polkami-oliver": "/product/prod_01KNTBXADW4A481E827ASE6FW3",
  "/kollekcii/oliver/etazherka-malaya-s-tremya-polkami-oliver": "/product/prod_01KNTBXADW6ZWB6HTCJ0C4XPY1",
  "/kollekcii/oliver/komod-oliver": "/product/prod_01KNTBXADDACBVH2BM1JSB2MWH",
  "/kollekcii/oliver/komod-shirokiy-oliver": "/product/prod_01KNTBXADD48JACA24PC4TXVCC",
  "/kollekcii/oliver/komod-stolovyy-oliver": "/product/prod_01KNTBXADK9SGFKMJV82MA9F4S",
  "/kollekcii/oliver/komod-vysokiy-oliver": "/product/prod_01KNTBXADDP2V5W6AKD074YRVF",
  "/kollekcii/oliver/konsol-oliver": "/product/prod_01KNTBXADR7DXSVHCM6Q99129G",
  "/kollekcii/oliver/konsol-s-polkami-oliver": "/product/prod_01KNTBXADRDXMGB8JRMAB1JHPS",
  "/kollekcii/oliver/kreslo-oliver": "/product/prod_01KNTBXADV8375RHNBHRQMXQ87",
  "/kollekcii/oliver/krovat-double-universalnaya-140h190-oliver": "/product/prod_01KNTBXADGPHKZEWKKT477WNR7",
  "/kollekcii/oliver/krovat-single-odnospalnaya-90h190-bez-iznozhya-oliver": "/product/prod_01KNTBXADFNYAQGPEQKCM4NPZE",
  "/kollekcii/oliver/krovat-single-odnospalnaya-90h190-oliver-ru-10": "/product/prod_01KNTBXADF36E724RQTW6Z73B0",
  "/kollekcii/oliver/krovat-single-odnospalnaya-90h190-oliver": "/product/prod_01KNTBXADFFPGAVHK024D20MEQ",
  "/kollekcii/oliver/krovat-small-double-polutornaya-120h190-bez-iznozhya-oliver": "/product/prod_01KNTBXADG6TFW8WB9SPQ4JTGD",
  "/kollekcii/oliver/krovat-super-king-dvuhspalnaya-180h200-oliver": "/product/prod_01KNTBXADHE1YFJS2VEPCRJJBN",
  "/kollekcii/oliver/krovatka-mladencheskaya-60h120-oliver": "/product/prod_01KNTBXADY87EJBJ40E55JCJBS",
  "/kollekcii/oliver/polka-knizhnaya-bolshaya-oliver": "/product/prod_01KNTBXADXD2X796J2TJ8SAG74",
  "/kollekcii/oliver/polka-knizhnaya-malaya-oliver": "/product/prod_01KNTBXADWPT0F9X7Y2SATPPGV",
  "/kollekcii/oliver/polka-knizhnaya-srednyaya-oliver": "/product/prod_01KNTBXADX120D41J3EXQASJ8Q",
  "/kollekcii/oliver/polka-knizhnaya-uglovaya-oliver": "/product/prod_01KNTBXADXM4N27AGHDHCV5QQA",
  "/kollekcii/oliver/shkaf-bufetnyy-so-steklom-oliver": "/product/prod_01KNTBXADM9PT13B1VAYEPXEHE",
  "/kollekcii/oliver/shkaf-dvuhdvernyy-oliver": "/product/prod_01KNTBXADCQ78KTFDG2CFXRDER",
  "/kollekcii/oliver/shkaf-kabinetnyy-oliver": "/product/prod_01KNTBXADVQ5PEJPEQG5B9X3KX",
  "/kollekcii/oliver/shkaf-knizhnyy-so-steklom-oliver": "/product/prod_01KNTBXADVBQXBYEJC03XRAF81",
  "/kollekcii/oliver/shkaf-odnodvernyy-s-zerkalom-oliver": "/product/prod_01KNTBXADCVVSRFRFK60X78V93",
  "/kollekcii/oliver/shkaf-trehdvernyy-oliver": "/product/prod_01KNTBXADCYJKGNAPE1WGQJBQZ",
  "/kollekcii/oliver/stellazh-dlya-knig-oliver": "/product/prod_01KNTBXADV29H43B35KXJJBA18",
  "/kollekcii/oliver/stellazh-shirokiy-oliver": "/product/prod_01KNTBXADWGB0430GYR8RJR7EM",
  "/kollekcii/oliver/stol-byuro-oliver": "/product/prod_01KNTBXADW4RDEYGV3MPTD64ZR",
  "/kollekcii/oliver/stol-pismennyy-c-tumboy-sleva-oliver": "/product/prod_01KNTBXADW0MYZ9SEBBAYPS5V4",
  "/kollekcii/oliver/stol-pismennyy-dvuhtumbovyy-oliver": "/product/prod_01KNTBXADWTF7DF2JX8E3P9YYQ",
  "/kollekcii/oliver/stol-rabochiy-oliver": "/product/prod_01KNTBXADW4ZCGJCC9RTC6Z5KC",
  "/kollekcii/oliver/stoleshnica-pelenalnaya-semnaya-oliver": "/product/prod_01KNTBXADX6G2DX0ZK33HBQDSJ",
  "/kollekcii/oliver/stolik-chaynyy-kruglyy-oliver": "/product/prod_01KNTBXADQK9VZ1N1X6CVH02J8",
  "/kollekcii/oliver/stolik-tualetnyy-s-zerkalom-oliver": "/product/prod_01KNTBXADD0VJ53P78YSGNCRDG",
  "/kollekcii/oliver/stul-oliver": "/product/prod_01KNTBXADJHD78QK7PQ1FM260H",
  "/kollekcii/oliver/tumba-dlya-televizora-oliver": "/product/prod_01KNTBXADQK0E63VFJ0KQPKRVX",
  "/kollekcii/oliver/tumbochka-prikrovatnaya-oliver": "/product/prod_01KNTBXADE04TT9T88M1SRC2T7",
  "/kollekcii/oliver/yaschik-dlya-igrushek-oliver": "/product/prod_01KNTBXADDKNMB17WD6NVSNRCY",
  "/kollekcii/oliver/zerkalo-napolnoe-oliver": "/product/prod_01KNTBXADFZ5RFACJQDNSGM6D2",
}

const CONTENT_HUBS: Record<string, string> = {
  "/kollekcii": "/catalog",
  "/vzroslie-kollekcii": "/catalog",
  "/detskie-kollekcii": "/kids/catalog",
  "/o-nas": "/about",
  "/oferta": "/offer",
}

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1)
  return pathname
}

export function legacyBuyerRedirectDestination(pathname: string): string | null {
  const path = stripTrailingSlash(pathname)
  if (CONTENT_HUBS[path]) return CONTENT_HUBS[path]
  if (/^\/kollekcii\/page-\d+$/.test(path)) return "/catalog"
  if (COLLECTION_HUBS[path]) return COLLECTION_HUBS[path]
  if (PRODUCT_REDIRECTS[path]) return PRODUCT_REDIRECTS[path]
  return null
}
