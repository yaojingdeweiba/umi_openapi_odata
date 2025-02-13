/*
  此文件处理表格查询转OData语法的逻辑

  主要入参：
    1、columns 表格定义的列，主要提取valueType属性列，根据此列的值决定生成的查询类型
    2、params 表格生成的form查询参数
    3、filter 表格快捷查询的查询参数
    4、sort 表格的排序列
    5、preParams 初始化自定义的odata查询参数字符串，该参数可为空

  出参：最终拼接完成的OData查询字符
*/

// 处理特殊字符
function escapeODataQuery(value: any) {
  console.log(typeof value);
  // 检查 value 是否为字符串类型
  if (typeof value === 'string') {
    // 替换单引号为两个单引号
    return value.replace(/'/g, "''");
  }
  // 非字符串类型直接返回原值
  return value;
}

// 转换所有条件为QueryString
function objectToQueryString(obj: any) {
  const keyValuePairs = [];

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      if (!value) continue;
      const encodedKey = encodeURIComponent(key);
      const encodedValue = encodeURIComponent(value);
      keyValuePairs.push(`${encodedKey}=${encodedValue}`);
    }
  }

  return keyValuePairs.join('&');
}

/* 排序转换 */
function sortToQuery(sort: any) {
  // sort 拿到的是一个{key:value}对象，其中key可能是,分割的多层级key，需处理成OData的/
  if (!sort) return;

  // 储存所有的排序对
  const keyValuePairs = [];

  // 获取所有键值对
  const entries = Object.entries(sort);
  // 循环转为OData支持的排序语法
  for (const [key, value] of entries) {
    keyValuePairs.push(`${key.replace(/,/g, '/')} ${value === 'descend' ? 'desc' : 'asc'}`);
  }

  const sortQueryString = keyValuePairs.join(',');
  return sortQueryString;
}

function flattenObject(obj: any, parentKey = '') {
  let result: any = {};

  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      let newKey = parentKey ? `${parentKey}/${key}` : key;

      if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
        // 如果值是对象，递归调用flattenObject
        Object.assign(result, flattenObject(obj[key], newKey));
      } else {
        // 否则直接赋值
        result[newKey] = obj[key];
      }
    }
  }

  return result;
}

function convertToISODateTime(dateTimeString: string) {
  return dateTimeString.replace(' ', 'T') + '+08:00';
}
function generateSearch(key: string, v: any, columns: any[]) {
  if (!v) return;

  const value = escapeODataQuery(v);

  // 1、根据key匹配出对应的column
  const currentColumn = columns.find((item: any) =>
    Array.isArray(item.dataIndex) ? item.dataIndex.join('/') === key : item.dataIndex === key,
  );

  if (!currentColumn || !currentColumn.valueType) return `contains(${key},'${value}') `;

  switch (currentColumn.valueType) {
    case 'digit':
    case 'select':
    case 'date':
      return `${key} eq ${value}`;
    // TODO: 会因为存在毫秒数导致查询不到数据
    case 'dateTime':
      return `${key} eq ${convertToISODateTime(value)}`;
    case 'dateYear':
      return `${key} eq ${value}`;
    case 'dateRange':
      return `${key} ge ${value[0]} and ${key} le ${value[1]}`;
    default:
      return `contains(${key}, '${value}')`;
  }
}

/* 拼接Filter */
function filterToQuery(params: any, filter: any, columns: any) {
  if (!params && !filter) return;

  /* 将查询参数转为odata filter */

  // 先删除用不上的分页属性
  delete params.current;
  delete params.pageSize;

  const keyValuePairs = [];

  // 获取params所有键值对
  const paramsEntries = Object.entries(flattenObject(params));

  for (const [key, value] of paramsEntries) {
    const searchStr = generateSearch(key, value, columns);
    if (searchStr) keyValuePairs.push(searchStr);
  }

  // 获取filter所有键值对
  const filterEntries = Object.entries(flattenObject(filter));
  for (const [key, value] of filterEntries) {
    const searchStr = generateSearch(key, value, columns);
    if (searchStr) keyValuePairs.push(searchStr);
  }
  // 把所有的拼起来
  return keyValuePairs.join(' and ');
}

export function tableToQueryString(
  columns: any,
  params: any,
  sort: any,
  filter: any,
  preParams?: any,
) {
  // 用来存储最终拼成的OData特性
  const path: any = {};

  // 分页，计算出top，skip
  let { current, pageSize } = params;
  let top = pageSize;
  let skip = (current! - 1) * pageSize!;
  path['count'] = true;
  path['top'] = top;
  path['skip'] = skip;

  // 排序
  const orderByStr = sortToQuery(sort);
  // 筛选
  const dynamicFilterStr = filterToQuery(params, filter, columns);
  // 处理 preParams
  if (preParams) {
    const filterValue = new URLSearchParams(preParams).get('filter');
    if (filterValue)
      path['filter'] = dynamicFilterStr ? filterValue + ' and ' + dynamicFilterStr : filterValue;
    else path['filter'] = dynamicFilterStr;
  } else {
    path['filter'] = dynamicFilterStr;
  }

  // Expand
  const expandValue = new URLSearchParams(preParams).get('expand');
  if (expandValue) {
    path['expand'] = expandValue;
  }

  // sort 如果有手动排序，优先使用手动排序
  if (orderByStr) {
    path['orderby'] = orderByStr;
  } else {
    const orderbyValue = new URLSearchParams(preParams).get('orderby');
    if (orderbyValue) {
      path['orderby'] = orderbyValue;
    }
  }

  let queryStr = objectToQueryString(path);

  return '?' + queryStr;
}
export function tableToQueryObject(
  columns: any,
  params: any,
  sort: any,
  filter: any,
  preParams?: any,
) {
  // 用来存储最终拼成的OData特性
  const path: any = {};

  // 分页，计算出top，skip
  let { current, pageSize } = params;
  let top = pageSize;
  let skip = (current! - 1) * pageSize!;
  path['count'] = true;
  path['top'] = top;
  path['skip'] = skip;

  // 排序
  const orderByStr = sortToQuery(sort);
  // 筛选
  const dynamicFilterStr = filterToQuery(params, filter, columns);
  // 处理 preParams
  if (preParams) {
    const filterValue = new URLSearchParams(preParams).get('filter');
    if (filterValue)
      path['filter'] = dynamicFilterStr ? filterValue + ' and ' + dynamicFilterStr : filterValue;
    else path['filter'] = dynamicFilterStr;
  } else {
    path['filter'] = dynamicFilterStr;
  }

  // Expand
  const expandValue = new URLSearchParams(preParams).get('expand');
  if (expandValue) {
    path['expand'] = expandValue;
  }

  // sort 如果有手动排序，优先使用手动排序
  if (orderByStr) {
    path['orderby'] = orderByStr;
  } else {
    const orderbyValue = new URLSearchParams(preParams).get('orderby');
    if (orderbyValue) {
      path['orderby'] = orderbyValue;
    }
  }

  // let queryStr = objectToQueryString(path);

  // return '?' + queryStr;
  return path;
}
// 移除导出无用的参数
export function generateExportQueryParams(url: string) {
  // 定义一个正则表达式来匹配要移除的参数
  const paramsToRemove = ['count', 'top', 'skip'];
  const regex = new RegExp(`&?(${paramsToRemove.join('|')})=[^&]*`, 'g');

  // 移除匹配的参数
  let newUrl = url.replace(regex, '');

  // 处理可能遗留的多余 '&'
  newUrl = newUrl.replace(/&&/g, '&').replace(/\?&/, '?');

  // 如果最后是 '?' 或 '&'，移除它们
  newUrl = newUrl.replace(/[?&]$/, '');

  return newUrl;
}
