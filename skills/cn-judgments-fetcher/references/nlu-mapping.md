# 参数映射

目标字段：

- `fullTextQuery`：用户原句或压缩后的全文检索语句
- `causeOfAction`：能稳定映射到裁判文书网案由的字段
- `legalBasis`：用户提到的法条或法律名称
- `courtLevel`：基层、中级、高级、最高
- `caseType`：民事、刑事、行政、执行、国家赔偿
- `requestedCount`：希望返回的案例数量

优先级：

1. 保住原始检索意图
2. 只抽取有把握的案由
3. 结果过多时再缩小范围

示例：

- “请你帮我找出与公司法中股东违反出资义务导致的案件”
  - `fullTextQuery`: `公司法 股东 违反出资义务`
  - `causeOfAction`: `股东出资`
  - `caseType`: `民事`
- “找近三年高级法院关于劳动合同解除赔偿的案例”
  - `courtLevel`: `高级法院`
  - `fullTextQuery`: `劳动合同解除 赔偿`
  - `dateRange`: 最近三年
