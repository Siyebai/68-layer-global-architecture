#!/bin/bash
# 生成文章配图（使用mermaid-cli或draw.io）
echo "生成架构图..."
# 使用draw.io CLI (若安装)
if command -v drawio &> /dev/null; then
  drawio -x -f png architecture-diagram.drawio -o architecture.png
else
  echo "draw.io未安装，使用ASCII占位图"
fi
echo "✅ 配图生成脚本已准备"
